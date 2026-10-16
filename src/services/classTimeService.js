'use strict';

/**
 * 上课时间读取服务
 *
 * 单独抽出来是因为课程查询（展示）与时间冲突检查（判定）都要用，
 * 放在业务模块里会造成互相依赖甚至循环依赖。
 */

const db = require('../db');

/**
 * 批量读取多门课程的上课时间
 * @param {number[]} courseIds
 * @returns {Map<number, object[]>} course_id -> 上课时间数组
 */
function loadByCourseIds(courseIds) {
  const grouped = new Map();
  if (!courseIds || courseIds.length === 0) return grouped;

  const placeholders = courseIds.map(() => '?').join(', ');
  const rows = db.all(
    `SELECT * FROM class_time
      WHERE course_id IN (${placeholders})
      ORDER BY course_id, day_of_week, start_period`,
    ...courseIds
  );

  for (const row of rows) {
    if (!grouped.has(row.course_id)) grouped.set(row.course_id, []);
    grouped.get(row.course_id).push(row);
  }
  return grouped;
}

/** 读取单门课程的上课时间 */
function getByCourseId(courseId) {
  return db.all(
    'SELECT * FROM class_time WHERE course_id = ? ORDER BY day_of_week, start_period',
    courseId
  );
}

/**
 * 读取某学生**当前已选中**课程的全部上课时间
 * @returns {Array<{course_id, code, name, time}>}
 */
function loadStudentEnrolledTimes(studentId) {
  return db.all(
    `SELECT ct.*, c.id AS course_id, c.code, c.name
       FROM enrollment e
       JOIN course c     ON c.id = e.course_id
       JOIN class_time ct ON ct.course_id = c.id
      WHERE e.student_id = ? AND e.status = 'enrolled'`,
    studentId
  );
}

/** 读取某教师所授课程的全部上课时间 */
function loadTeacherTimes(teacherId) {
  return db.all(
    `SELECT ct.*, c.id AS course_id, c.code, c.name
       FROM course c
       JOIN class_time ct ON ct.course_id = c.id
      WHERE c.teacher_id = ? AND c.status = 'open'`,
    teacherId
  );
}

module.exports = {
  loadByCourseIds,
  getByCourseId,
  loadStudentEnrolledTimes,
  loadTeacherTimes
};
