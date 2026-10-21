'use strict';

/**
 * 初始化数据库并写入演示数据（需求 E1：演示级数据规模）
 *
 * 用法：
 *   npm run init-db    初始化（已有数据则跳过）
 *   npm run reset-db   清空重建并重新写入演示数据
 *
 * 所有演示账号的密码统一为：123456
 */

const fs = require('node:fs');
const db = require('./index');
const config = require('../config');
const { hashPassword } = require('../utils/password');

const DEMO_PASSWORD = '123456';

const DEPARTMENTS = {
  CS: '计算机学院',
  MATH: '数学学院',
  FL: '外国语学院',
  PHY: '物理学院'
};

const TEACHERS = [
  ['T1001', '张伟', DEPARTMENTS.CS],
  ['T1002', '李娜', DEPARTMENTS.CS],
  ['T1003', '王强', DEPARTMENTS.MATH],
  ['T1004', '刘洋', DEPARTMENTS.FL],
  ['T1005', '陈静', DEPARTMENTS.CS],
  ['T1006', '赵磊', DEPARTMENTS.PHY],
  ['T1007', '孙倩', DEPARTMENTS.MATH],
  ['T1008', '周涛', DEPARTMENTS.PHY],
  ['T1009', '吴敏', DEPARTMENTS.FL],
  // 以下 3 位用于演示「多名教师并存」：教师端只看得到自己的课
  ['T1010', '郑海', DEPARTMENTS.CS],
  ['T1011', '冯雪', DEPARTMENTS.FL],
  ['T1012', '孟凡', DEPARTMENTS.MATH]
];

const STUDENTS = [
  ['2024010101', '陈思远'],
  ['2024010102', '林悦'],
  ['2024010103', '黄浩然'],
  ['2024010104', '周雨桐'],
  ['2024010105', '吴梓涵'],
  ['2024010106', '郑一鸣'],
  ['2024010107', '徐若曦'],
  ['2024010108', '何俊杰'],
  ['2024010109', '高雅琴'],
  ['2024010110', '罗子豪'],
  ['2024010111', '谢文轩'],
  ['2024010112', '唐嘉怡'],
  // 以下为扩充的演示学生：用于观察「一个学生选课 → 教师名单 / 管理员统计同步变化」
  ['2024010113', '沈亦凡'],
  ['2024010114', '韩雨琪'],
  ['2024010115', '曹子航'],
  ['2024010116', '魏思彤'],
  ['2024010117', '陆嘉豪'],
  ['2024010118', '严静怡'],
  ['2024010119', '方启铭'],
  ['2024010120', '白诗涵'],
  ['2024010121', '崔浩宇'],
  ['2024010122', '姜可欣'],
  ['2024010123', '程宇轩'],
  ['2024010124', '汪欣然'],
  ['2024010125', '潘博文'],
  ['2024010126', '董雨萱'],
  ['2024010127', '袁子豪'],
  ['2024010128', '苏梦洁'],
  ['2024010129', '蔡俊熙'],
  ['2024010130', '杜佳琪'],
  ['2024010131', '叶青松'],
  ['2024010132', '范书瑶'],
  ['2024010133', '邱天磊'],
  ['2024010134', '石若冰'],
  ['2024010135', '侯明轩'],
  ['2024010136', '任晓晴'],
  ['2024010137', '龚一凡'],
  ['2024010138', '姚安琪'],
  ['2024010139', '廖子睿'],
  ['2024010140', '谭雪莹']
];

// [课程代码, 课程名, 教师工号, 学分, 容量, 院系, 上课地点, 上课时间[]]
// 上课时间：[星期(1-7), 起始节, 结束节, 周次类型(all/odd/even), 起始周, 结束周]
const COURSES = [
  ['CS101', '程序设计基础', 'T1001', 4.0, 60, DEPARTMENTS.CS, '主楼 A301', [[1, 1, 2, 'all', 1, 16], [3, 3, 4, 'all', 1, 16]]],
  ['CS102', '数据结构', 'T1002', 4.0, 50, DEPARTMENTS.CS, '主楼 A302', [[2, 1, 2, 'all', 1, 16], [4, 3, 4, 'all', 1, 16]]],
  ['CS103', '计算机组成原理', 'T1005', 3.5, 45, DEPARTMENTS.CS, '主楼 A303', [[3, 1, 2, 'all', 1, 16]]],
  ['CS104', '操作系统', 'T1001', 4.0, 40, DEPARTMENTS.CS, '主楼 A305', [[4, 1, 2, 'all', 1, 16], [5, 5, 6, 'odd', 1, 16]]],
  ['CS105', '计算机网络', 'T1002', 3.5, 40, DEPARTMENTS.CS, '主楼 A306', [[5, 1, 2, 'all', 1, 16]]],
  ['CS106', '数据库系统原理', 'T1005', 3.5, 50, DEPARTMENTS.CS, '主楼 A307', [[1, 6, 7, 'all', 1, 16]]],
  ['CS107', '软件工程', 'T1001', 3.0, 60, DEPARTMENTS.CS, '主楼 A308', [[2, 6, 7, 'all', 1, 16]]],
  ['CS108', '算法设计与分析', 'T1002', 3.0, 30, DEPARTMENTS.CS, '主楼 A309', [[3, 6, 7, 'even', 1, 16]]],
  ['CS109', '人工智能导论', 'T1005', 2.5, 80, DEPARTMENTS.CS, '主楼 B101', [[4, 6, 7, 'all', 1, 16]]],
  ['CS110', '编译原理', 'T1001', 3.5, 35, DEPARTMENTS.CS, '主楼 A310', [[5, 6, 7, 'all', 1, 16]]],
  ['CS111', '前沿技术研讨', 'T1005', 1.0, 2, DEPARTMENTS.CS, '主楼 C201', [[4, 10, 11, 'all', 1, 16]]],
  ['CS112', '移动应用开发', 'T1005', 3.0, 40, DEPARTMENTS.CS, '主楼 C202', [[5, 8, 9, 'all', 1, 16]]],
  // 故意与 CS101（张伟，周一 1-2 节）排在同一时段，
  // 用于演示教师端「授课时间冲突提示」（R7）——真实教务系统里这正是需要被发现的排课事故。
  ['CS113', '计算机图形学', 'T1001', 3.0, 40, DEPARTMENTS.CS, '主楼 B201', [[1, 1, 2, 'all', 1, 16]]],

  ['MA101', '高等数学 A', 'T1003', 5.0, 120, DEPARTMENTS.MATH, '二教 101', [[1, 1, 2, 'all', 1, 16], [3, 1, 2, 'all', 1, 16]]],
  ['MA102', '线性代数', 'T1003', 3.0, 100, DEPARTMENTS.MATH, '二教 102', [[2, 3, 4, 'all', 1, 16]]],
  ['MA103', '概率论与数理统计', 'T1003', 3.0, 90, DEPARTMENTS.MATH, '二教 103', [[4, 1, 2, 'all', 1, 16]]],
  ['MA104', '离散数学', 'T1007', 3.0, 60, DEPARTMENTS.MATH, '二教 104', [[5, 3, 4, 'all', 1, 16]]],
  ['MA105', '数学分析选讲', 'T1007', 2.0, 30, DEPARTMENTS.MATH, '二教 201', [[2, 10, 11, 'all', 1, 16]]],

  ['EN101', '大学英语（一）', 'T1004', 3.0, 60, DEPARTMENTS.FL, '外语楼 201', [[1, 3, 4, 'all', 1, 16]]],
  ['EN102', '大学英语（二）', 'T1004', 3.0, 60, DEPARTMENTS.FL, '外语楼 202', [[2, 3, 4, 'all', 1, 16]]],
  ['EN103', '学术英语写作', 'T1009', 2.0, 40, DEPARTMENTS.FL, '外语楼 203', [[3, 3, 4, 'all', 1, 16]]],
  ['EN104', '日语入门', 'T1009', 2.0, 50, DEPARTMENTS.FL, '外语楼 204', [[4, 5, 6, 'all', 1, 16]]],
  ['EN105', '英语视听说', 'T1004', 2.0, 45, DEPARTMENTS.FL, '外语楼 205', [[5, 3, 4, 'all', 1, 16]]],

  ['PH101', '大学物理', 'T1006', 4.0, 100, DEPARTMENTS.PHY, '理科楼 101', [[3, 5, 6, 'all', 1, 16]]],
  ['PH102', '物理实验', 'T1006', 1.5, 40, DEPARTMENTS.PHY, '物理实验中心', [[5, 8, 9, 'all', 1, 16]]],
  ['PH103', '量子力学导论', 'T1008', 3.0, 25, DEPARTMENTS.PHY, '理科楼 305', [[4, 8, 9, 'all', 1, 16]]],

  ['GE101', '思想道德与法治', 'T1007', 3.0, 150, DEPARTMENTS.MATH, '大礼堂', [[1, 10, 11, 'all', 1, 16]]],
  ['GE102', '中国近现代史纲要', 'T1007', 3.0, 150, DEPARTMENTS.MATH, '大礼堂', [[2, 8, 9, 'all', 1, 16]]],
  ['GE103', '体育（一）', 'T1008', 1.0, 50, DEPARTMENTS.PHY, '体育馆', [[3, 8, 9, 'all', 1, 16]]],
  ['GE104', '体育（二）', 'T1008', 1.0, 50, DEPARTMENTS.PHY, '体育馆', [[4, 10, 11, 'all', 1, 16]]],
  ['GE105', '大学生心理健康', 'T1007', 2.0, 120, DEPARTMENTS.MATH, '大礼堂', [[5, 10, 11, 'all', 1, 16]]],
  ['GE106', '创新创业基础', 'T1009', 2.0, 80, DEPARTMENTS.FL, '文科楼 101', [[2, 5, 6, 'all', 1, 16]]],
  ['GE107', '艺术鉴赏', 'T1009', 2.0, 100, DEPARTMENTS.FL, '文科楼 102', [[3, 10, 11, 'all', 1, 16]]]
];

// 预置选课：[学号, 课程代码, 状态]
const PRELOADED_ENROLLMENTS = [
  // 陈思远：已选 4 门（互不冲突）
  ['2024010101', 'CS101', 'enrolled'],
  ['2024010101', 'MA102', 'enrolled'],
  ['2024010101', 'EN101', 'enrolled'],
  ['2024010101', 'GE101', 'enrolled'],
  // 前沿技术研讨（容量 2）已满，后两人进入候补
  ['2024010102', 'CS111', 'enrolled'],
  ['2024010103', 'CS111', 'enrolled'],
  ['2024010104', 'CS111', 'waiting'],
  ['2024010105', 'CS111', 'waiting'],
  // 其他学生零散选课
  ['2024010102', 'CS101', 'enrolled'],
  ['2024010103', 'CS101', 'enrolled'],
  ['2024010106', 'CS102', 'enrolled'],
  ['2024010107', 'PH101', 'enrolled']
];

// 为扩充的演示学生批量分配选课。
// 三套组合内部两两不冲突（节次相邻不算冲突，见 C3），按学号轮换，
// 这样教师名单与管理员统计里的人数不会整齐划一，看起来更像真实数据。
const ENROLL_PACKAGES = [
  ['CS102', 'MA101', 'EN102'],
  ['CS103', 'MA102', 'EN103', 'GE103'],
  ['CS105', 'PH101', 'GE104', 'EN104']
];

STUDENTS.slice(12).forEach(([username], index) => {
  for (const courseCode of ENROLL_PACKAGES[index % ENROLL_PACKAGES.length]) {
    PRELOADED_ENROLLMENTS.push([username, courseCode, 'enrolled']);
  }
});

const ANNOUNCEMENTS = [
  ['2026-2027 学年第一学期选课通知', '本轮选课已开放，请于选课窗口内完成选课。选课期间可自由退课，退课不受时间限制。', 1],
  ['关于《移动应用开发》停开的通知', '因选课人数不足，《移动应用开发》（CS112）本学期停开，已选同学请改选其他课程。', 0],
  ['选课系统使用说明', '登录后可查询课程、选课、退课并查看选课结果。课程满员时可加入候补队列，有同学退课时将按候补顺序自动补位。', 0]
];

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString().replace('T', ' ').slice(0, 19);
}

async function dropAll() {
  const tables = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
  await db.exec('PRAGMA foreign_keys = OFF');
  for (const { name } of tables) {
    await db.exec(`DROP TABLE IF EXISTS "${name}"`);
  }
  await db.exec('PRAGMA foreign_keys = ON');
}

async function seed() {
  const createdAt = nowIso();
  const { salt, hash } = hashPassword(DEMO_PASSWORD);

  const insertUser = async (username, name, role, department, grade) =>
    (await db.run(
      `INSERT INTO user (username, password_hash, password_salt, name, role, department, grade, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      username, hash, salt, name, role, department, grade, createdAt
    )).lastInsertRowid;

  const adminId = await insertUser('admin', '系统管理员', 'admin', '教务处', null);

  const teacherIds = {};
  for (const [username, name, department] of TEACHERS) {
    teacherIds[username] = await insertUser(username, name, 'teacher', department, null);
  }

  const studentIds = {};
  for (const [username, name] of STUDENTS) {
    const grade = Number(username.slice(0, 4));
    studentIds[username] = await insertUser(username, name, 'student', DEPARTMENTS.CS, grade);
  }

  // 学期与选课窗口（B2：管理员可配置；此处预置为「正在开放中」）
  const semesterId = (await db.run(
    `INSERT INTO semester (name, start_date, total_weeks, select_open_at, select_close_at, is_current)
     VALUES (?, ?, ?, ?, ?, ?)`,
    '2026-2027 学年第一学期', '2026-09-07', 16,
    nowIso(-7 * 24 * 3600 * 1000), nowIso(14 * 24 * 3600 * 1000), 1
  )).lastInsertRowid;

  const courseIds = {};
  const COURSE_SQL =
    `INSERT INTO course (code, name, teacher_id, semester_id, department, credits, capacity, location, description, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const CLASS_TIME_SQL =
    `INSERT INTO class_time (course_id, day_of_week, start_period, end_period, week_type, start_week, end_week)
     VALUES (?, ?, ?, ?, ?, ?, ?)`;

  for (const [code, name, teacherUsername, credits, capacity, department, location, times] of COURSES) {
    // CS112 演示「停开」状态
    const status = code === 'CS112' ? 'closed' : 'open';
    const courseId = (await db.run(
      COURSE_SQL,
      code, name, teacherIds[teacherUsername], semesterId, department,
      credits, capacity, location, `${name}（${code}）`, status, createdAt
    )).lastInsertRowid;
    courseIds[code] = courseId;

    for (const [day, startPeriod, endPeriod, weekType, startWeek, endWeek] of times) {
      await db.run(CLASS_TIME_SQL, courseId, day, startPeriod, endPeriod, weekType, startWeek, endWeek);
    }
  }

  const ENROLLMENT_SQL =
    `INSERT INTO enrollment (student_id, course_id, status, waitlist_joined_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`;
  for (const [username, code, status] of PRELOADED_ENROLLMENTS) {
    await db.run(
      ENROLLMENT_SQL,
      studentIds[username],
      courseIds[code],
      status,
      status === 'waiting' ? createdAt : null,
      createdAt,
      createdAt
    );
  }

  const ANNOUNCEMENT_SQL =
    'INSERT INTO announcement (title, content, author_id, pinned, created_at) VALUES (?, ?, ?, ?, ?)';
  for (const [title, content, pinned] of ANNOUNCEMENTS) {
    await db.run(ANNOUNCEMENT_SQL, title, content, adminId, pinned, createdAt);
  }

  await db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '1')");
  await db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded_at', ?)", createdAt);
}

async function main() {
  const reset = process.argv.includes('--reset');

  if (reset && fs.existsSync(config.db.file)) {
    db.close();
    fs.rmSync(config.db.file, { force: true });
    fs.rmSync(`${config.db.file}.lock`, { force: true });
    console.log(`已删除旧数据库：${config.db.file}`);
  }

  await db.initSchema();

  const existing = (await db.get('SELECT COUNT(*) AS c FROM user')).c;
  if (existing > 0 && !reset) {
    console.log(`数据库已有 ${existing} 个用户，跳过写入。如需重建请执行：npm run reset-db`);
    return;
  }

  if (reset) {
    await dropAll();
    await db.initSchema();
  }

  // 整批写入放在一个事务里：既保证要么全成功要么全回滚，
  // 也避免每条语句各自 fsync 造成初始化过慢。
  await db.transaction(async () => await seed());

  const stats = {
    用户: (await db.get('SELECT COUNT(*) AS c FROM user')).c,
    课程: (await db.get('SELECT COUNT(*) AS c FROM course')).c,
    上课时间: (await db.get('SELECT COUNT(*) AS c FROM class_time')).c,
    选课记录: (await db.get('SELECT COUNT(*) AS c FROM enrollment')).c,
    候补记录: (await db.get('SELECT COUNT(*) AS c FROM enrollment WHERE status = ?', 'waiting')).c,
    公告: (await db.get('SELECT COUNT(*) AS c FROM announcement')).c
  };

  console.log('演示数据写入完成：');
  for (const [key, value] of Object.entries(stats)) {
    console.log(`  ${key}：${value}`);
  }
  console.log(`  数据库文件：${config.db.file}`);
  console.log(`  演示账号密码：${DEMO_PASSWORD}`);
}

(async () => {
  try {
    await main();
  } catch (err) {
    console.error('初始化失败：', err);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
