'use strict';

/**
 * 选课 / 退课 / 候补服务（需求 §2.1-2/3/4、B4，规则 R1 R2 R3 R6 R9）
 *
 * 设计要点：
 *   1. **所有写操作都在 db.transaction 内完成**。校验与占用名额必须原子，
 *      否则并发下会出现「余量只剩 1，两个人都选上」的超卖（需求 E2）。
 *   2. 服务层不抛业务异常，统一返回 { ok, code, message, data }，
 *      便于路由层与压测脚本共用同一套判定结果。
 *   3. 时间冲突判定委托给 conflictService，本模块不重复实现比较逻辑。
 */

const db = require('../db');
const windowService = require('./windowService');
const conflictService = require('./conflictService');
const classTimeService = require('./classTimeService');

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function ok(code, message, data = null) {
  return { ok: true, code, message, data };
}

function fail(code, message, data = null) {
  return { ok: false, code, message, data };
}

function toCourseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** 已选人数（算余量的唯一口径） */
async function countEnrolled(courseId) {
  return (await db.get(
    "SELECT COUNT(*) AS c FROM enrollment WHERE course_id = ? AND status = 'enrolled'",
    courseId
  )).c;
}

/** 候补人数 */
async function countWaiting(courseId) {
  return (await db.get(
    "SELECT COUNT(*) AS c FROM enrollment WHERE course_id = ? AND status = 'waiting'",
    courseId
  )).c;
}

async function getCourseRow(courseId) {
  return await db.get(
    `SELECT c.*, u.name AS teacher_name
       FROM course c JOIN user u ON u.id = c.teacher_id
      WHERE c.id = ?`,
    courseId
  );
}

/** 某学生在某课候补队列中的位次（1 表示队首） */
async function waitlistPosition(courseId, studentId) {
  const me = await db.get(
    `SELECT id, waitlist_joined_at FROM enrollment
      WHERE course_id = ? AND student_id = ? AND status = 'waiting'`,
    courseId,
    studentId
  );
  if (!me) return 0;

  const ahead = (await db.get(
    `SELECT COUNT(*) AS c FROM enrollment
      WHERE course_id = ? AND status = 'waiting'
        AND (waitlist_joined_at < ? OR (waitlist_joined_at = ? AND id < ?))`,
    courseId,
    me.waitlist_joined_at,
    me.waitlist_joined_at,
    me.id
  )).c;
  return ahead + 1;
}

/**
 * 写入或更新选课记录。
 * 复用手上已有的一行（含此前退课留下的 dropped 行），
 * 这样提交 UNIQUE(student_id, course_id) 永远不会冲突。
 */
async function upsertEnrollment(existing, studentId, courseId, status, waitlistJoinedAt, now) {
  if (existing) {
    await db.run(
      'UPDATE enrollment SET status = ?, waitlist_joined_at = ?, updated_at = ? WHERE id = ?',
      status,
      waitlistJoinedAt,
      now,
      existing.id
    );
    return existing.id;
  }
  return (await db.run(
    `INSERT INTO enrollment (student_id, course_id, status, waitlist_joined_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    studentId,
    courseId,
    status,
    waitlistJoinedAt,
    now,
    now
  )).lastInsertRowid;
}

/**
 * 候选补位：从队首依次向后找第一个不冲突的学生补上（R1 / R3 / 已拍板决策）
 *
 * - 只补一个人（一次退课只释放一个名额）
 * - 冲突者被跳过但**保留在队列中**，等他调整课表后下次仍有机会
 * - 全程不判断选课窗口（R3：补位不受窗口开关影响）
 */
async function promoteNext(courseId, course, now) {
  if (await countEnrolled(courseId) >= Number(course.capacity)) return null;

  const queue = await db.all(
    `SELECT id, student_id FROM enrollment
      WHERE course_id = ? AND status = 'waiting'
      ORDER BY waitlist_joined_at, id`,
    courseId
  );

  for (const item of queue) {
    const conflicts = await conflictService.findStudentConflicts(item.student_id, courseId);
    if (conflicts.length > 0) continue; // 跳过并顺延

    await db.run(
      "UPDATE enrollment SET status = 'enrolled', waitlist_joined_at = NULL, updated_at = ? WHERE id = ?",
      now,
      item.id
    );

    const student = await db.get('SELECT name, username FROM user WHERE id = ?', item.student_id);
    return { studentId: item.student_id, name: student.name, username: student.username };
  }
  return null;
}

/**
 * 选课（§2.1-2 / §2.1-4 / B4）
 *
 * 校验顺序（R6）：窗口 → 课程状态 → 是否已选 → 时间冲突 → 余量并占用名额
 */
async function enroll(studentId, courseId) {
  const id = toCourseId(courseId);
  if (!id) return fail('COURSE_NOT_FOUND', '课程不存在');

  return await db.transaction(async () => {
    const course = await getCourseRow(id);
    if (!course) return fail('COURSE_NOT_FOUND', '课程不存在');

    const windowState = await windowService.getWindowState(
      await windowService.getSemesterById(course.semester_id)
    );
    if (!windowState.open) {
      return fail('WINDOW_CLOSED', `${windowState.label}，当前不可选课`);
    }

    if (course.status !== 'open') {
      return fail('COURSE_CLOSED', '该课程已停开，不可选课');
    }

    const existing = await db.get(
      'SELECT * FROM enrollment WHERE student_id = ? AND course_id = ?',
      studentId,
      id
    );
    if (existing && existing.status === 'enrolled') {
      return fail('ALREADY_ENROLLED', `你已经选中了「${course.name}」`);
    }
    if (existing && existing.status === 'waiting') {
      return fail('ALREADY_WAITING', `你已经在「${course.name}」的候补队列中`);
    }

    // 进候补也要校验冲突（已拍板决策）
    const conflicts = await conflictService.findStudentConflicts(studentId, id);
    if (conflicts.length > 0) {
      const names = conflicts.map((c) => `${c.name}（${c.code}）`).join('、');
      return fail('CONFLICT', `与已选课程时间冲突：${names}`, { conflicts });
    }

    const now = nowIso();

    if (await countEnrolled(id) < Number(course.capacity)) {
      await upsertEnrollment(existing, studentId, id, 'enrolled', null, now);
      return ok('ENROLLED', `选课成功：${course.name}`, { status: 'enrolled' });
    }

    // 名额已满 → 转入候补（R2：候补队列上限 = 课程容量）
    if (await countWaiting(id) >= Number(course.capacity)) {
      return fail('WAITLIST_FULL', `「${course.name}」名额已满，候补队列也已满`);
    }

    await upsertEnrollment(existing, studentId, id, 'waiting', now, now);
    const position = await waitlistPosition(id, studentId);
    return ok('WAITLISTED', `「${course.name}」名额已满，已加入候补队列（第 ${position} 位）`, {
      status: 'waiting',
      position
    });
  });
}

/**
 * 退课（§2.1-3 / B3 / R3 / R9）
 *
 * 退课**不受选课窗口限制**；退课后触发候补自动补位。
 */
async function drop(studentId, courseId) {
  const id = toCourseId(courseId);
  if (!id) return fail('COURSE_NOT_FOUND', '课程不存在');

  return await db.transaction(async () => {
    const course = await getCourseRow(id);
    if (!course) return fail('COURSE_NOT_FOUND', '课程不存在');

    const existing = await db.get(
      'SELECT * FROM enrollment WHERE student_id = ? AND course_id = ?',
      studentId,
      id
    );
    if (!existing || existing.status !== 'enrolled') {
      return fail('NOT_ENROLLED', `你尚未选中「${course.name}」`);
    }

    const now = nowIso();
    await db.run(
      "UPDATE enrollment SET status = 'dropped', waitlist_joined_at = NULL, updated_at = ? WHERE id = ?",
      now,
      existing.id
    );

    const promoted = await promoteNext(id, course, now);
    const message = promoted
      ? `已退选「${course.name}」，候补队列中的 ${promoted.name} 已自动补位`
      : `已退选「${course.name}」`;

    return ok('DROPPED', message, { promoted, courseId: id });
  });
}

/** 主动退出候补队列 */
async function cancelWaitlist(studentId, courseId) {
  const id = toCourseId(courseId);
  if (!id) return fail('COURSE_NOT_FOUND', '课程不存在');

  return await db.transaction(async () => {
    const course = await getCourseRow(id);
    if (!course) return fail('COURSE_NOT_FOUND', '课程不存在');

    const existing = await db.get(
      'SELECT * FROM enrollment WHERE student_id = ? AND course_id = ?',
      studentId,
      id
    );
    if (!existing || existing.status !== 'waiting') {
      return fail('NOT_WAITING', `你不在「${course.name}」的候补队列中`);
    }

    await db.run(
      "UPDATE enrollment SET status = 'dropped', waitlist_joined_at = NULL, updated_at = ? WHERE id = ?",
      nowIso(),
      existing.id
    );
    return ok('WAITLIST_CANCELLED', `已退出「${course.name}」的候补队列`);
  });
}

/** 我的选课结果（§2.1-6） */
async function listMyEnrollments(studentId) {
  const rows = await db.all(
    `SELECT e.id AS enrollment_id, e.status, e.waitlist_joined_at, e.updated_at,
            c.id AS course_id, c.code, c.name, c.credits, c.capacity, c.location,
            c.department, c.status AS course_status, u.name AS teacher_name,
            (SELECT COUNT(*) FROM enrollment e2
              WHERE e2.course_id = c.id AND e2.status = 'enrolled') AS enrolled_count,
            (SELECT COUNT(*) FROM enrollment e2
              WHERE e2.course_id = c.id AND e2.status = 'waiting')  AS waitlist_count
       FROM enrollment e
       JOIN course c ON c.id = e.course_id
       JOIN user   u ON u.id = c.teacher_id
      WHERE e.student_id = ? AND e.status IN ('enrolled', 'waiting')
      ORDER BY c.code`,
    studentId
  );

  const timeMap = await classTimeService.loadByCourseIds(rows.map((r) => r.course_id));
  const decorated = rows.map((r) => ({
    ...r,
    credits: Number(r.credits),
    capacity: Number(r.capacity),
    enrolled_count: Number(r.enrolled_count),
    waitlist_count: Number(r.waitlist_count),
    class_times: timeMap.get(r.course_id) || []
  }));

  const enrolled = decorated.filter((r) => r.status === 'enrolled');
  // 候补需要逐个查位次（异步查询不能用同步 map）
  const waiting = [];
  for (const r of decorated.filter((row) => row.status === 'waiting')) {
    waiting.push({ ...r, position: await waitlistPosition(r.course_id, studentId) });
  }

  return {
    enrolled,
    waiting,
    totalCredits: enrolled.reduce((sum, r) => sum + r.credits, 0)
  };
}

module.exports = {
  enroll,
  drop,
  cancelWaitlist,
  listMyEnrollments,
  countEnrolled,
  countWaiting,
  waitlistPosition,
  promoteNext
};
