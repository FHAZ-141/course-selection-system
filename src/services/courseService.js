'use strict';

/**
 * 课程查询服务（需求 §2.1-1）
 *
 * 职责：按条件检索课程，并汇总每门课的容量与选课情况。
 * 不负责：选课 / 退课（见 enrollmentService）、时间冲突判定（见 conflictService）。
 *
 * 设计要点：
 *   1. 列表查询用相关子查询统计人数，避免 N+1；
 *   2. 上课时间与"我的选课状态"单独批量查询后在内存中合并，
 *      而不是写进主 SQL —— 这样 SQL 的参数顺序始终清晰可控
 *      （本项目的 SQLite 驱动对参数顺序敏感，混排容易出错）。
 */

const db = require('../db');
const classTimeService = require('./classTimeService');

async function getCurrentSemester() {
  return await db.get('SELECT * FROM semester WHERE is_current = 1 ORDER BY id DESC LIMIT 1');
}

/**
 * 批量取某学生对这些课的选课状态
 * @returns {Map<number, string>} course_id -> status
 */
async function loadMyStatus(studentId, courseIds) {
  const map = new Map();
  if (!studentId || courseIds.length === 0) return map;

  const placeholders = courseIds.map(() => '?').join(', ');
  const rows = await db.all(
    `SELECT course_id, status FROM enrollment
      WHERE student_id = ? AND course_id IN (${placeholders})`,
    studentId,
    ...courseIds
  );
  for (const row of rows) map.set(row.course_id, row.status);
  return map;
}

const BASE_SELECT = `
  SELECT c.id, c.code, c.name, c.department, c.credits, c.capacity,
         c.location, c.description, c.status, c.teacher_id, c.semester_id,
         u.name AS teacher_name,
         (SELECT COUNT(*) FROM enrollment e
           WHERE e.course_id = c.id AND e.status = 'enrolled') AS enrolled_count,
         (SELECT COUNT(*) FROM enrollment e
           WHERE e.course_id = c.id AND e.status = 'waiting')  AS waitlist_count
    FROM course c
    JOIN user u ON u.id = c.teacher_id
`;

/** 给课程行补充派生字段：余量、可选状态、上课时间、我的状态 */
function decorate(rows, classTimeMap, myStatusMap) {
  return rows.map((row) => {
    const enrolled = Number(row.enrolled_count) || 0;
    const capacity = Number(row.capacity) || 0;
    const remaining = Math.max(capacity - enrolled, 0);
    const isFull = enrolled >= capacity;

    let selectable = true;
    let reason = '';
    if (row.status === 'closed') {
      selectable = false;
      reason = '课程已停开';
    } else if (isFull) {
      selectable = false;
      reason = '名额已满，可选候补';
    }

    return {
      ...row,
      credits: Number(row.credits),
      capacity,
      enrolled_count: enrolled,
      waitlist_count: Number(row.waitlist_count) || 0,
      remaining,
      isFull,
      selectable,
      reason,
      class_times: classTimeMap.get(row.id) || [],
      my_status: myStatusMap.get(row.id) || null
    };
  });
}

/**
 * 课程列表查询
 * @param {object} options
 * @param {number} [options.keyword]     课程名或课程代码模糊匹配
 * @param {number} [options.teacherId]   授课教师
 * @param {string} [options.department]  开课院系
 * @param {number} [options.dayOfWeek]   上课星期（1-7）
 * @param {number} [options.studentId]   当前学生 id，用于标记"我的选课状态"
 */
async function listCourses(options = {}) {
  const semester = await getCurrentSemester();
  if (!semester) {
    return { semester: null, courses: [], filters: { departments: [], teachers: [] } };
  }

  const where = ['c.semester_id = ?'];
  const params = [semester.id];

  const keyword = (options.keyword || '').trim();
  if (keyword) {
    where.push('(c.name LIKE ? OR c.code LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (options.teacherId) {
    where.push('c.teacher_id = ?');
    params.push(Number(options.teacherId));
  }
  if (options.department) {
    where.push('c.department = ?');
    params.push(options.department);
  }
  if (options.dayOfWeek) {
    where.push(
      'EXISTS (SELECT 1 FROM class_time ct WHERE ct.course_id = c.id AND ct.day_of_week = ?)'
    );
    params.push(Number(options.dayOfWeek));
  }

  const rows = await db.all(
    `${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY c.code`,
    ...params
  );

  const ids = rows.map((r) => r.id);
  const courses = decorate(
    rows,
    await classTimeService.loadByCourseIds(ids),
    await loadMyStatus(options.studentId, ids)
  );

  return {
    semester,
    courses,
    filters: {
      departments: (await db.all(
        'SELECT DISTINCT department AS d FROM course WHERE semester_id = ? AND department IS NOT NULL ORDER BY d',
        semester.id
      )).map((r) => r.d),
      teachers: await db.all(
        `SELECT DISTINCT u.id, u.name
           FROM course c JOIN user u ON u.id = c.teacher_id
          WHERE c.semester_id = ?
          ORDER BY u.name`,
        semester.id
      )
    }
  };
}

/**
 * 课程详情
 * @returns {object|null} 课程对象，或 null（课程不存在）
 */
async function getCourseDetail(courseId, studentId) {
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const row = await db.get(`${BASE_SELECT} WHERE c.id = ?`, id);
  if (!row) return null;

  const [course] = decorate(
    [row],
    await classTimeService.loadByCourseIds([id]),
    await loadMyStatus(studentId, [id])
  );
  return course;
}

module.exports = {
  getCurrentSemester,
  listCourses,
  getCourseDetail,
  decorate
};
