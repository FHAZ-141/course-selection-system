'use strict';

/**
 * 课程查询路由（需求 F1）
 *
 * 本层只做三件事：取参数 → 调服务 → 选模板渲染。
 * 业务规则一律在 src/services/courseService.js 中。
 */

const express = require('express');
const courseService = require('../services/courseService');
const format = require('../utils/format');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

// 三种角色都可查询课程
router.use(requireLogin, requireRole('student', 'teacher', 'admin'));

/** 课程列表 + 检索 */
router.get('/', (req, res) => {
  const query = {
    keyword: String(req.query.keyword || '').trim(),
    teacherId: req.query.teacherId || '',
    department: req.query.department || '',
    dayOfWeek: req.query.dayOfWeek || ''
  };

  const studentId = req.user.role === 'student' ? req.user.id : null;
  const data = courseService.listCourses({
    keyword: query.keyword,
    teacherId: query.teacherId,
    department: query.department,
    dayOfWeek: query.dayOfWeek,
    studentId
  });

  res.render('course_list', {
    title: '课程查询',
    semester: data.semester,
    courses: data.courses,
    filters: data.filters,
    query,
    backPath: req.originalUrl,
    fmt: format
  });
});

/** 课程详情 */
router.get('/:id', (req, res, next) => {
  const studentId = req.user.role === 'student' ? req.user.id : null;
  const course = courseService.getCourseDetail(req.params.id, studentId);

  if (!course) {
    const err = new Error(`课程不存在：${req.params.id}`);
    err.status = 404;
    return next(err);
  }

  return res.render('course_detail', {
    title: course.name,
    course,
    backPath: req.originalUrl,
    fmt: format
  });
});

module.exports = router;
