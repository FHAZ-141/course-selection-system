'use strict';

/**
 * 管理后台服务（规则 R8）
 *
 * 职责：课程的增删改查（含上课时间）、选课窗口配置、选课统计。
 * 不负责：公告的读写（复用 announcementService）、权限校验（路由层）。
 *
 * 关键约束：
 *   1. 课程与其上课时间是「整体替换」关系 —— 保存时先删旧排课再插入新排课，
 *      必须在同一事务内完成，否则中途失败会留下半截数据。
 *   2. 有选课记录的课程**不允许删除**（enrollment 表未设级联），
 *      只能改为「停开」状态。这样学生的选课结果不会凭空消失。
 */

const db = require('../db');
const config = require('../config');

function nowIso() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function ok(code, message, data = null) {
  return { ok: true, code, message, data };
}

function fail(code, message, data = null) {
  return { ok: false, code, message, data };
}

/** 把表单值统一成数组（qs 在单值时给字符串、多值时给数组） */
function toArray(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

// ---------------------------------------------------------------- 学期

async function getCurrentSemester() {
  return await db.get('SELECT * FROM semester WHERE is_current = 1 ORDER BY id DESC LIMIT 1');
}

async function getSemesterById(id) {
  return await db.get('SELECT * FROM semester WHERE id = ?', id);
}

/** 把 datetime-local 输入（2026-10-16T10:00）规整成数据库格式 */
function normalizeDateTime(value) {
  if (!value) return null;
  const raw = String(value).trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw)) return null;
  return raw.length === 16 ? `${raw}:00` : raw;
}

/** 把数据库格式转成 datetime-local 需要的格式（供表单回填） */
function toDateTimeLocal(value) {
  if (!value) return '';
  return String(value).slice(0, 16).replace(' ', 'T');
}

/**
 * 保存选课窗口
 * @returns {{ok:boolean, code:string, message:string}}
 */
async function saveWindow({ semesterId, openAt, closeAt }) {
  const semester = await getSemesterById(semesterId);
  if (!semester) return fail('SEMESTER_NOT_FOUND', '学期不存在');

  const open = normalizeDateTime(openAt);
  const close = normalizeDateTime(closeAt);

  if (!open || !close) return fail('INVALID_DATETIME', '请填写完整的开放与截止时间');

  if (open >= close) {
    return fail('INVALID_RANGE', '截止时间必须晚于开放时间');
  }

  await db.run(
    'UPDATE semester SET select_open_at = ?, select_close_at = ? WHERE id = ?',
    open,
    close,
    semester.id
  );

  const state = open <= nowIso() && nowIso() <= close ? '当前处于开放中' : '当前不在开放时段';
  return ok('WINDOW_SAVED', `选课窗口已保存（${open} ~ ${close}，${state}）`);
}

// ---------------------------------------------------------------- 教师与院系

async function listTeachers() {
  return await db.all(
    "SELECT id, username, name, department FROM user WHERE role = 'teacher' ORDER BY name"
  );
}

async function listDepartments(semesterId) {
  const rows = await db.all(
    'SELECT DISTINCT department AS d FROM course WHERE semester_id = ? AND department IS NOT NULL ORDER BY d',
    semesterId
  );
  return rows.map((r) => r.d);
}

// ---------------------------------------------------------------- 课程

const COURSE_SELECT = `
  SELECT c.*, u.name AS teacher_name,
         (SELECT COUNT(*) FROM enrollment e
           WHERE e.course_id = c.id AND e.status = 'enrolled') AS enrolled_count,
         (SELECT COUNT(*) FROM enrollment e
           WHERE e.course_id = c.id AND e.status = 'waiting')  AS waitlist_count,
         (SELECT COUNT(*) FROM class_time ct WHERE ct.course_id = c.id) AS time_count
    FROM course c
    JOIN user u ON u.id = c.teacher_id
`;

/** 管理视角的课程列表（含停开课程） */
async function listCourses(semesterId) {
  const rows = await db.all(`${COURSE_SELECT} WHERE c.semester_id = ? ORDER BY c.code`, semesterId);
  return rows.map((r) => ({
    ...r,
    credits: Number(r.credits),
    capacity: Number(r.capacity),
    enrolled_count: Number(r.enrolled_count),
    waitlist_count: Number(r.waitlist_count),
    remaining: Math.max(Number(r.capacity) - Number(r.enrolled_count), 0)
  }));
}

/** 某门课 + 它的全部上课时间（编辑页回填用） */
async function getCourseForEdit(courseId) {
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const course = await db.get(`${COURSE_SELECT} WHERE c.id = ?`, id);
  if (!course) return null;

  return {
    ...course,
    credits: Number(course.credits),
    capacity: Number(course.capacity),
    class_times: await db.all(
      'SELECT * FROM class_time WHERE course_id = ? ORDER BY day_of_week, start_period',
      id
    )
  };
}

/**
 * 校验课程字段
 * @returns {{ok:boolean, message?:string}}
 */
async function validateCourse(input) {
  const code = String(input.code || '').trim();
  const name = String(input.name || '').trim();
  const credits = Number(input.credits);
  const capacity = Number(input.capacity);

  if (!code) return fail('CODE_REQUIRED', '请填写课程代码');
  if (!/^[A-Za-z]{1,6}\d{1,4}$/.test(code)) {
    return fail('CODE_INVALID', '课程代码格式应为「字母 + 数字」，如 CS101');
  }
  if (!name) return fail('NAME_REQUIRED', '请填写课程名称');
  if (name.length > 50) return fail('NAME_TOO_LONG', '课程名称不能超过 50 字');
  if (!Number.isFinite(credits) || credits <= 0 || credits > 20) {
    return fail('CREDITS_INVALID', '学分需在 0 ~ 20 之间');
  }
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 500) {
    return fail('CAPACITY_INVALID', '容量需为 0 ~ 500 的整数');
  }
  if (!input.teacherId) return fail('TEACHER_REQUIRED', '请选择授课教师');

  const teacher = await db.get("SELECT id FROM user WHERE id = ? AND role = 'teacher'", input.teacherId);
  if (!teacher) return fail('TEACHER_INVALID', '所选教师不存在');

  const times = input.classTimes || [];
  for (let i = 0; i < times.length; i += 1) {
    const t = times[i];
    const no = i + 1;
    if (!Number.isInteger(t.dayOfWeek) || t.dayOfWeek < 1 || t.dayOfWeek > 7) {
      return fail('TIME_INVALID', `第 ${no} 段上课时间：星期取值应为 1~7`);
    }
    if (!Number.isInteger(t.startPeriod) || t.startPeriod < 1 || t.startPeriod > 12) {
      return fail('TIME_INVALID', `第 ${no} 段上课时间：起始节次应为 1~12`);
    }
    if (!Number.isInteger(t.endPeriod) || t.endPeriod < t.startPeriod || t.endPeriod > 12) {
      return fail('TIME_INVALID', `第 ${no} 段上课时间：结束节次不能小于起始节次，且不超过 12`);
    }
    if (!['all', 'odd', 'even'].includes(t.weekType)) {
      return fail('TIME_INVALID', `第 ${no} 段上课时间：周次类型不合法`);
    }
    if (
      !Number.isInteger(t.startWeek) || t.startWeek < 1 ||
      !Number.isInteger(t.endWeek) || t.endWeek < t.startWeek || t.endWeek > 30
    ) {
      return fail('TIME_INVALID', `第 ${no} 段上课时间：周次区间不合法`);
    }
  }

  return { ok: true };
}

/**
 * 新增或更新课程（含上课时间的整体替换）
 * @param {object} input 已由路由层整理好的结构化数据
 */
async function saveCourse(input) {
  const invalid = await validateCourse(input);
  if (!invalid.ok) return invalid;

  const courseId = input.id ? Number(input.id) : null;
  const semester = input.semesterId ? await getSemesterById(input.semesterId) : await getCurrentSemester();
  if (!semester) return fail('SEMESTER_NOT_FOUND', '请先配置学期');

  const code = String(input.code).trim().toUpperCase();
  // 注意：不能写成 `WHERE code = ? AND (? IS NULL OR id <> ?)`
  // PostgreSQL 无法推断"只用于 IS NULL 比较"的参数类型，会报
  // could not determine data type of parameter $n。这里按有无 id 分别查。
  const duplicated = courseId
    ? await db.get('SELECT id, code FROM course WHERE code = ? AND id <> ?', code, courseId)
    : await db.get('SELECT id, code FROM course WHERE code = ?', code);
  if (duplicated) return fail('CODE_DUPLICATED', `课程代码 ${code} 已被占用`);

  const times = input.classTimes || [];
  const now = nowIso();

  const savedId = await db.transaction(async () => {
    let id = courseId;

    if (id) {
      const existing = await db.get('SELECT id FROM course WHERE id = ?', id);
      if (!existing) {
        throw Object.assign(new Error('课程不存在'), { business: true });
      }
      await db.run(
        `UPDATE course
            SET code = ?, name = ?, teacher_id = ?, department = ?, credits = ?,
                capacity = ?, location = ?, description = ?, status = ?
          WHERE id = ?`,
        code,
        String(input.name).trim(),
        Number(input.teacherId),
        input.department ? String(input.department).trim() : null,
        Number(input.credits),
        Number(input.capacity),
        input.location ? String(input.location).trim() : null,
        input.description ? String(input.description).trim() : null,
        input.status === 'closed' ? 'closed' : 'open',
        id
      );
      // 排课整体替换
      await db.run('DELETE FROM class_time WHERE course_id = ?', id);
    } else {
      id = (await db.run(
        `INSERT INTO course (code, name, teacher_id, semester_id, department, credits,
                             capacity, location, description, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        code,
        String(input.name).trim(),
        Number(input.teacherId),
        semester.id,
        input.department ? String(input.department).trim() : null,
        Number(input.credits),
        Number(input.capacity),
        input.location ? String(input.location).trim() : null,
        input.description ? String(input.description).trim() : null,
        input.status === 'closed' ? 'closed' : 'open',
        now
      )).lastInsertRowid;
    }

    for (const t of times) {
      await db.run(
        `INSERT INTO class_time (course_id, day_of_week, start_period, end_period,
                                 week_type, start_week, end_week)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        t.dayOfWeek,
        t.startPeriod,
        t.endPeriod,
        t.weekType,
        t.startWeek,
        t.endWeek
      );
    }

    return id;
  });

  return courseId
    ? ok('UPDATED', `课程「${input.name}」已更新`, { id: savedId })
    : ok('CREATED', `课程「${input.name}」已创建`, { id: savedId });
}

/** 删除课程；有选课记录时拒绝 */
async function deleteCourse(courseId) {
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) return fail('NOT_FOUND', '课程不存在');

  const course = await db.get('SELECT id, code, name FROM course WHERE id = ?', id);
  if (!course) return fail('NOT_FOUND', '课程不存在');

  const enrolled = (await db.get(
    "SELECT COUNT(*) AS c FROM enrollment WHERE course_id = ? AND status IN ('enrolled','waiting')",
    id
  )).c;
  if (enrolled > 0) {
    return fail(
      'HAS_ENROLLMENTS',
      `「${course.name}」还有 ${enrolled} 条生效中的选课记录，不能删除；请改为「停开」状态`
    );
  }

  await db.run('DELETE FROM class_time WHERE course_id = ?', id);
  await db.run('DELETE FROM enrollment WHERE course_id = ?', id);
  await db.run('DELETE FROM course WHERE id = ?', id);

  return ok('DELETED', `课程「${course.name}」已删除`);
}

// ---------------------------------------------------------------- 统计

/** 各课程的选课与候补统计 */
async function enrollmentStats(semesterId) {
  const rows = await db.all(
      `SELECT c.id, c.code, c.name, c.capacity, u.name AS teacher_name,
              (SELECT COUNT(*) FROM enrollment e
                WHERE e.course_id = c.id AND e.status = 'enrolled') AS enrolled_count,
              (SELECT COUNT(*) FROM enrollment e
                WHERE e.course_id = c.id AND e.status = 'waiting')  AS waitlist_count
         FROM course c JOIN user u ON u.id = c.teacher_id
        WHERE c.semester_id = ?
        ORDER BY enrolled_count DESC, c.code`,
      semesterId
  );
  return rows.map((r) => ({
    ...r,
    capacity: Number(r.capacity),
    enrolled_count: Number(r.enrolled_count),
    waitlist_count: Number(r.waitlist_count),
    loadRate: Number(r.capacity) > 0
      ? Math.round((Number(r.enrolled_count) / Number(r.capacity)) * 100)
      : 0
  }));
}

/** 后台概览数字 */
async function overview(semesterId) {
  return {
    courseCount: (await db.get('SELECT COUNT(*) AS c FROM course WHERE semester_id = ?', semesterId)).c,
    openCount: (await db.get(
      "SELECT COUNT(*) AS c FROM course WHERE semester_id = ? AND status = 'open'",
      semesterId
    )).c,
    studentCount: (await db.get("SELECT COUNT(*) AS c FROM user WHERE role = 'student'")).c,
    teacherCount: (await db.get("SELECT COUNT(*) AS c FROM user WHERE role = 'teacher'")).c,
    enrolledCount: (await db.get(
      `SELECT COUNT(*) AS c FROM enrollment e JOIN course c ON c.id = e.course_id
        WHERE c.semester_id = ? AND e.status = 'enrolled'`,
      semesterId
    )).c,
    waitingCount: (await db.get(
      `SELECT COUNT(*) AS c FROM enrollment e JOIN course c ON c.id = e.course_id
        WHERE c.semester_id = ? AND e.status = 'waiting'`,
      semesterId
    )).c,
    announcementCount: (await db.get('SELECT COUNT(*) AS c FROM announcement')).c
  };
}

module.exports = {
  getCurrentSemester,
  getSemesterById,
  saveWindow,
  normalizeDateTime,
  toDateTimeLocal,
  listTeachers,
  listDepartments,
  listCourses,
  getCourseForEdit,
  validateCourse,
  saveCourse,
  deleteCourse,
  enrollmentStats,
  overview,
  toArray,
  weekTypes: config.weekTypes
};
