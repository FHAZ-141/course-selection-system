'use strict';

/**
 * 并发与业务规则验证脚本（需求 E2 / E3）
 *
 * 目标：验证「多人抢同一门课时，容量不会被突破」，以及候补补位、选课窗口
 * 相关的几条关键规则确实按需求生效。
 *
 * 为什么能验证并发安全：
 *   脚本在**同一进程内**启动 Express 应用，并用 fetch 同时（Promise.all）
 *   发出 N 个选课请求。请求会经过完整的 HTTP → 路由 → 事务链路。
 *   最终断言数据库中的实际人数不超过容量——超卖会被立刻抓出来。
 *
 * 独立性：全程使用临时数据库文件，不会影响 data/ 下的正式数据。
 *
 * 用法：npm run stress
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// ⚠️ 必须在 require('../src/config') 之前设置，配置在加载时即读取环境变量
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-stress-'));
process.env.DB_FILE = path.join(TMP_DIR, 'stress.sqlite');
process.env.SESSION_SECRET = 'stress-test-secret';

const ROOT = path.resolve(__dirname, '..');
const db = require('../src/db');
const app = require('../src/app');
const enrollmentService = require('../src/services/enrollmentService');

let PASS = 0;
let FAIL = 0;

function check(label, actual, expected) {
  if (String(actual) === String(expected)) {
    console.log(`  ✅ ${label}（${actual}）`);
    PASS += 1;
  } else {
    console.log(`  ❌ ${label}　期望 ${expected}，实际 ${actual}`);
    FAIL += 1;
  }
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}${detail ? `（${detail}）` : ''}`);
    PASS += 1;
  } else {
    console.log(`  ❌ ${label}${detail ? `（${detail}）` : ''}`);
    FAIL += 1;
  }
}

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** 用 fetch 登录并取回会话 Cookie */
async function login(base, username) {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password: '123456' }),
    redirect: 'manual'
  });
  const raw = res.headers.getSetCookie
    ? res.headers.getSetCookie()[0]
    : res.headers.get('set-cookie');
  if (!raw) throw new Error(`登录失败，未返回 Cookie：${username}`);
  return raw.split(';')[0];
}

/** 提交一个表单请求，并跟随重定向读取 flash 提示 */
async function submit(base, url, cookie, fields = {}) {
  const res = await fetch(`${base}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookie
    },
    body: new URLSearchParams(fields),
    redirect: 'manual'
  });

  const location = res.headers.get('location') || '';
  let flash = '';
  if (location) {
    const page = await fetch(location.startsWith('http') ? location : `${base}${location}`, {
      headers: { Cookie: cookie }
    }).then((r) => r.text());
    const matched = page.match(/alert alert-(?:ok|error)">([^<]*)</);
    if (matched) flash = matched[1].trim();
  }
  return { status: res.status, location, flash };
}

async function main() {
  console.log('==============================================');
  console.log('  选课并发与业务规则验证');
  console.log('==============================================');
  console.log(`临时数据库：${process.env.DB_FILE}\n`);

  // 1) 初始化演示数据
  execFileSync(process.execPath, [path.join(ROOT, 'src', 'db', 'seed.js')], {
    env: { ...process.env },
    stdio: 'ignore'
  });

  // 2) 造一门用于冲击的小容量课程（容量 3，且不排课 → 不会与他人冲突）
  const semester = db.get('SELECT * FROM semester WHERE is_current = 1');
  const teacher = db.get("SELECT id FROM user WHERE role = 'teacher' ORDER BY id LIMIT 1");
  const courseId = db.run(
    `INSERT INTO course (code, name, teacher_id, semester_id, department, credits, capacity, location, description, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'TEST01', '并发测试课程', teacher.id, semester.id, '计算机学院', 1.0, 3, '测试教室', '并发验证用', 'open', nowIso()
  ).lastInsertRowid;

  const students = db.all("SELECT id, username, name FROM user WHERE role = 'student' ORDER BY id LIMIT 10");
  const CAPACITY = 3;

  // 3) 启动应用内服务器
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const cookies = [];
    for (const stu of students) cookies.push(await login(base, stu.username));

    console.log('【场景一】10 名学生同时抢容量为 3 的课程');
    const burst = await Promise.all(
      students.map((stu, i) =>
        submit(base, '/enrollments', cookies[i], { courseId, back: '/courses' })
      )
    );
    const enrolledResult = burst.filter((r) => r.flash.includes('选课成功')).length;
    // 注意：必须用完整短语匹配。"候补队列也已满" 的提示里同样含"候补"二字，
    // 用 includes('候补') 会把被拒绝的请求也算进来。
    const waitlistResult = burst.filter((r) => r.flash.includes('已加入候补队列')).length;
    const rejected = burst.filter((r) => r.flash.includes('候补队列也已满')).length;

    const afterBurst = {
      enrolled: enrollmentService.countEnrolled(courseId),
      waiting: enrollmentService.countWaiting(courseId)
    };

    check('实际选中人数 = 容量（不超卖）', afterBurst.enrolled, CAPACITY);
    check('进入候补的人数 = 候补上限（= 容量）', afterBurst.waiting, CAPACITY);
    check('提示"选课成功"的请求数', enrolledResult, CAPACITY);
    check('提示"已加入候补"的请求数', waitlistResult, CAPACITY);
    check('候补队列满而被拒绝的请求数', rejected, students.length - CAPACITY * 2);

    console.log('\n【场景二】退课触发候补自动补位（§2.1-3 / B4 / R1）');
    const enrolledRows = db.all(
      "SELECT id, student_id FROM enrollment WHERE course_id = ? AND status = 'enrolled' ORDER BY id",
      courseId
    );
    const dropper = students.find((s) => s.id === enrolledRows[0].student_id);
    const dropperIndex = students.findIndex((s) => s.id === dropper.id);
    const headOfQueueBefore = db.get(
      "SELECT student_id FROM enrollment WHERE course_id = ? AND status = 'waiting' ORDER BY waitlist_joined_at, id LIMIT 1",
      courseId
    );

    const dropResult = await submit(base, `/enrollments/${courseId}/drop`, cookies[dropperIndex], {
      back: '/enrollments/my'
    });
    const afterDrop = {
      enrolled: enrollmentService.countEnrolled(courseId),
      waiting: enrollmentService.countWaiting(courseId)
    };
    const promotedRow = db.get(
      "SELECT student_id FROM enrollment WHERE course_id = ? AND status = 'enrolled' AND student_id = ?",
      courseId,
      headOfQueueBefore.student_id
    );

    check('退课后已选人数仍为容量', afterDrop.enrolled, CAPACITY);
    check('候补人数相应减少 1', afterDrop.waiting, CAPACITY - 1);
    assert('队首候补同学被自动补位', !!promotedRow);
    assert('提示中包含补位说明', dropResult.flash.includes('自动补位'), dropResult.flash);

    console.log('\n【场景三】选课窗口关闭后的行为（B2 / B3 / R3）');
    db.run(
      "UPDATE semester SET select_close_at = ? WHERE id = ?",
      '2000-01-01 00:00:00',
      semester.id
    );

    const outsiderIndex = students.findIndex(
      (s) =>
        !db.get(
          'SELECT 1 AS x FROM enrollment WHERE course_id = ? AND student_id = ?',
          courseId,
          s.id
        )
    );
    const outsider = students[outsiderIndex];
    const closedEnroll = await submit(base, '/enrollments', cookies[outsiderIndex], {
      courseId,
      back: '/courses'
    });
    assert('窗口关闭后选课被拒绝', closedEnroll.flash.includes('截止'), closedEnroll.flash);

    const enrolledBeforeSecondDrop = enrollmentService.countEnrolled(courseId);
    const secondDropper = students.find(
      (s) =>
        s.id !== outsider.id &&
        db.get(
          "SELECT 1 AS x FROM enrollment WHERE course_id = ? AND student_id = ? AND status = 'enrolled'",
          courseId,
          s.id
        )
    );
    const secondDrop = await submit(
      base,
      `/enrollments/${courseId}/drop`,
      cookies[students.findIndex((s) => s.id === secondDropper.id)],
      { back: '/enrollments/my' }
    );
    const afterSecondDrop = enrollmentService.countEnrolled(courseId);
    const waitingAfterSecondDrop = enrollmentService.countWaiting(courseId);

    assert('窗口关闭后退课仍然成功（B3）', secondDrop.flash.includes('已退选'), secondDrop.flash);
    check('窗口关闭后退课释放的名额仍被候补补位（R3）', afterSecondDrop, enrolledBeforeSecondDrop);
    check('候补队列继续减少', waitingAfterSecondDrop, CAPACITY - 2);

    console.log('\n【场景四】边界拒绝');
    const already = await submit(base, '/enrollments', cookies[dropperIndex], {
      courseId: 999999,
      back: '/courses'
    });
    assert('不存在的课程被拒绝', already.flash.includes('课程不存在'), already.flash);

    const windowOpenAgain = await submit(base, '/enrollments', cookies[outsiderIndex], {
      courseId,
      back: '/courses'
    });
    assert(
      '窗口仍关闭时依旧拒绝',
      windowOpenAgain.flash.includes('截止'),
      windowOpenAgain.flash
    );
  } finally {
    server.close();
    db.close();
    try {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    } catch (_) {
      /* 清理失败不影响结论 */
    }
  }

  console.log('\n==============================================');
  console.log(`  通过 ${PASS} 项，失败 ${FAIL} 项`);
  console.log('==============================================');
  if (FAIL > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('验证脚本执行失败：', err);
  process.exitCode = 1;
});
