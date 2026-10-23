'use strict';

/**
 * 教师端路由（规则 R7）
 *
 * 权限边界：只能查看**自己所授**课程的数据。
 * 越权访问他人课程时返回 403（而不是 404，便于排查是权限问题而不是数据不存在）。
 */

const express = require('express');
const teacherService = require('../services/teacherService');
const format = require('../utils/format');
const { flashAndBack } = require('../utils/flash');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireLogin, requireRole('teacher'));

/** 教师端首页 */
router.get('/', async (req, res) => {
  res.render('teacher/home', {
    title: '教师端',
    stats: await teacherService.overview(req.user.id),
    courses: (await teacherService.listMyCourses(req.user.id)).slice(0, 5),
    fmt: format
  });
});

/** 我所授课程 */
router.get('/courses', async (req, res) => {
  res.render('teacher/course_list', {
    title: '我的课程',
    courses: await teacherService.listMyCourses(req.user.id),
    fmt: format
  });
});

/** 某门课的选课名单 */
router.get('/courses/:id/students', async (req, res, next) => {
  const data = await teacherService.getCourseStudents(req.user.id, req.params.id);

  if (!data) {
    // 课程不存在，或不属于当前教师
    const exists = await require('../db').get('SELECT id FROM course WHERE id = ?', Number(req.params.id));
    if (!exists) {
      const err = new Error('课程不存在');
      err.status = 404;
      return next(err);
    }
    const err = new Error('你只能查看自己所授课程的选课名单');
    err.status = 403;
    return next(err);
  }

  return res.render('teacher/course_students', {
    title: `选课名单 · ${data.course.name}`,
    course: data.course,
    enrolled: data.enrolled,
    waiting: data.waiting,
    fmt: format
  });
});

/** 为自己所授课程中的已选学生办理退课；可能触发候补自动补位。 */
router.post('/courses/:courseId/students/:studentId/drop', async (req, res, next) => {
  const result = await teacherService.dropStudentFromMyCourse(
    req.user.id, req.params.courseId, req.params.studentId
  );
  if (result.code === 'COURSE_NOT_OWNED') {
    const course = await require('../db').get('SELECT id FROM course WHERE id = ?', Number(req.params.courseId));
    if (!course) {
      const err = new Error('课程不存在');
      err.status = 404;
      return next(err);
    }
    const err = new Error('你只能管理自己所授课程的选课名单');
    err.status = 403;
    return next(err);
  }
  return flashAndBack(req, res, result, `/teacher/courses/${encodeURIComponent(req.params.courseId)}/students`);
});

/** 授课时间冲突提示 */
router.get('/conflicts', async (req, res) => {
  res.render('teacher/conflicts', {
    title: '授课时间冲突',
    conflicts: await teacherService.findMyConflicts(req.user.id),
    fmt: format
  });
});

module.exports = router;
