'use strict';

/**
 * 教师端服务（规则 R7）
 *
 * 职责：教师查看自己所授课程、选课名单，以及"自己所授课程之间的时间冲突"提示。
 * 权限边界：**只能看自己的课**。所有按课程 id 取数据的方法都必须同时传入 teacherId，
 * 并在查询条件里带上 teacher_id —— 不要"先查出来再判断"，那样容易漏。
 */

const db = require('../db');
const classTimeService = require('./classTimeService');
const conflictService = require('./conflictService');

/** 教师概览数字 */
async function overview(teacherId) {
  const courses = await db.get(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open FROM course WHERE teacher_id = ?",
    teacherId
  );

  const enrolled = await db.get(
    `SELECT COUNT(*) AS c FROM enrollment e JOIN course c ON c.id = e.course_id
      WHERE c.teacher_id = ? AND e.status = 'enrolled'`,
    teacherId
  ).c;

  const waiting = await db.get(
    `SELECT COUNT(*) AS c FROM enrollment e JOIN course c ON c.id = e.course_id
      WHERE c.teacher_id = ? AND e.status = 'waiting'`,
    teacherId
  ).c;

  return {
    courseCount: Number(courses.total) || 0,
    openCount: Number(courses.open) || 0,
    enrolledCount: Number(enrolled) || 0,
    waitingCount: Number(waiting) || 0,
    conflictCount: (await conflictService.findTeacherConflicts(teacherId)).length
  };
}

/** 我所授课程列表（含容量与选课人数） */
async function listMyCourses(teacherId) {
  const rows = await db.all(
    `SELECT c.id, c.code, c.name, c.credits, c.capacity, c.status,
            c.department, c.location,
            s.name AS semester_name,
            (SELECT COUNT(*) FROM enrollment e
              WHERE e.course_id = c.id AND e.status = 'enrolled') AS enrolled_count,
            (SELECT COUNT(*) FROM enrollment e
              WHERE e.course_id = c.id AND e.status = 'waiting')  AS waitlist_count
       FROM course c
       JOIN semester s ON s.id = c.semester_id
      WHERE c.teacher_id = ?
      ORDER BY c.code`,
    teacherId
  );

  const timeMap = await classTimeService.loadByCourseIds(rows.map((r) => r.id));
  return rows.map((r) => ({
    ...r,
    credits: Number(r.credits),
    capacity: Number(r.capacity),
    enrolled_count: Number(r.enrolled_count),
    waitlist_count: Number(r.waitlist_count),
    remaining: Math.max(Number(r.capacity) - Number(r.enrolled_count), 0),
    class_times: timeMap.get(r.id) || []
  }));
}

/**
 * 取某门课的选课名单
 * @returns {object|null} 课程不在该教师名下时返回 null（调用方转 403/404）
 */
async function getCourseStudents(teacherId, courseId) {
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) return null;

  // 关键：把 teacher_id 放进 WHERE，而不是查出来再比对
  const course = await db.get(
    `SELECT c.*, s.name AS semester_name
       FROM course c
       JOIN semester s ON s.id = c.semester_id
      WHERE c.id = ? AND c.teacher_id = ?`,
    id,
    teacherId
  );
  if (!course) return null;

  const students = await db.all(
    `SELECT u.username, u.name, u.grade, u.department,
            e.status, e.created_at, e.waitlist_joined_at, e.updated_at
       FROM enrollment e
       JOIN user u ON u.id = e.student_id
      WHERE e.course_id = ? AND e.status IN ('enrolled', 'waiting')
      ORDER BY CASE e.status WHEN 'enrolled' THEN 0 ELSE 1 END,
               e.waitlist_joined_at IS NOT NULL, e.waitlist_joined_at, u.username`,
    id
  );

  return {
    course: {
      ...course,
      credits: Number(course.credits),
      capacity: Number(course.capacity),
      class_times: await classTimeService.getByCourseId(id)
    },
    enrolled: students.filter((s) => s.status === 'enrolled'),
    waiting: students.filter((s) => s.status === 'waiting')
  };
}

/** 我所授课程之间的时间冲突 */
async function findMyConflicts(teacherId) {
  return await conflictService.findTeacherConflicts(teacherId);
}

module.exports = {
  overview,
  listMyCourses,
  getCourseStudents,
  findMyConflicts
};
