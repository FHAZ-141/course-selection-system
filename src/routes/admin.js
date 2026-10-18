'use strict';

/**
 * 管理后台路由（规则 R8）
 *
 * 只做四件事：取参数 → 整理成结构化数据 → 调服务 → 渲染或重定向。
 * 业务校验在 src/services/adminService.js，公告相关复用 announcementService。
 */

const express = require('express');
const adminService = require('../services/adminService');
const announcementService = require('../services/announcementService');
const format = require('../utils/format');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireLogin, requireRole('admin'));

/** 把表单里并列的排课数组拼成结构化数据 */
function parseClassTimes(body) {
  const days = adminService.toArray(body.ct_day);
  const starts = adminService.toArray(body.ct_start);
  const ends = adminService.toArray(body.ct_end);
  const weekTypes = adminService.toArray(body.ct_week_type);
  const startWeeks = adminService.toArray(body.ct_start_week);
  const endWeeks = adminService.toArray(body.ct_end_week);

  const times = [];
  for (let i = 0; i < days.length; i += 1) {
    const day = String(days[i] || '').trim();
    const start = String(starts[i] || '').trim();
    const end = String(ends[i] || '').trim();
    // 整行都没填就跳过，避免空行被当成非法数据
    if (!day && !start && !end) continue;

    times.push({
      dayOfWeek: Number(day),
      startPeriod: Number(start),
      endPeriod: Number(end),
      weekType: String(weekTypes[i] || 'all').trim() || 'all',
      startWeek: Number(String(startWeeks[i] || '1').trim()) || 1,
      endWeek: Number(String(endWeeks[i] || '16').trim()) || 16
    });
  }
  return times;
}

/** 从请求体整理课程字段 */
function parseCourse(body, courseId) {
  return {
    id: courseId || null,
    code: String(body.code || '').trim(),
    name: String(body.name || '').trim(),
    teacherId: body.teacherId ? Number(body.teacherId) : null,
    department: String(body.department || '').trim(),
    credits: Number(body.credits),
    capacity: Number(body.capacity),
    location: String(body.location || '').trim(),
    description: String(body.description || '').trim(),
    status: body.status === 'closed' ? 'closed' : 'open',
    semesterId: body.semesterId ? Number(body.semesterId) : null,
    classTimes: parseClassTimes(body)
  };
}

/** 把数据库行或表单输入统一成 camelCase，供表单模板使用 */
function normalizeTimes(list) {
  return (list || []).map((t) => ({
    dayOfWeek: t.day_of_week !== undefined ? t.day_of_week : t.dayOfWeek,
    startPeriod: t.start_period !== undefined ? t.start_period : t.startPeriod,
    endPeriod: t.end_period !== undefined ? t.end_period : t.endPeriod,
    weekType: t.week_type || t.weekType || 'all',
    startWeek: t.start_week !== undefined ? t.start_week : (t.startWeek || 1),
    endWeek: t.end_week !== undefined ? t.end_week : (t.endWeek || 16)
  }));
}

function normalizeCourse(c) {
  const src = c || {};
  return {
    id: src.id || null,
    code: src.code || '',
    name: src.name || '',
    teacherId: src.teacher_id || src.teacherId || '',
    department: src.department || '',
    credits: src.credits !== undefined && src.credits !== null ? Number(src.credits) : 2,
    capacity: src.capacity !== undefined && src.capacity !== null ? Number(src.capacity) : 40,
    location: src.location || '',
    description: src.description || '',
    status: src.status || 'open'
  };
}

/** 渲染课程表单（新增与编辑共用） */
function renderCourseForm(req, res, options) {
  const semester = adminService.getCurrentSemester();
  res.render('admin/course_form', {
    title: options.title,
    mode: options.mode,
    course: normalizeCourse(options.course),
    times: normalizeTimes(options.times),
    error: options.error || null,
    semester,
    teachers: adminService.listTeachers(),
    departments: adminService.listDepartments(semester ? semester.id : 0),
    weekTypes: adminService.weekTypes,
    fmt: format
  });
}

// ---------------------------------------------------------------- 概览

router.get('/', (req, res) => {
  const semester = adminService.getCurrentSemester();
  res.render('admin/overview', {
    title: '管理后台',
    semester,
    windowState: require('../services/windowService').getWindowState(semester),
    stats: semester ? adminService.overview(semester.id) : null,
    fmt: format
  });
});

// ---------------------------------------------------------------- 课程

router.get('/courses', (req, res) => {
  const semester = adminService.getCurrentSemester();
  res.render('admin/course_list', {
    title: '课程管理',
    semester,
    courses: semester ? adminService.listCourses(semester.id) : [],
    fmt: format
  });
});

router.get('/courses/new', (req, res) => {
  renderCourseForm(req, res, {
    title: '新增课程',
    mode: 'create',
    course: { status: 'open', credits: 2, capacity: 40 },
    times: []
  });
});

router.post('/courses', (req, res) => {
  const input = parseCourse(req.body, null);
  const result = adminService.saveCourse(input);

  if (!result.ok) {
    return renderCourseForm(req, res, {
      title: '新增课程',
      mode: 'create',
      course: { ...input, teacher_id: input.teacherId },
      times: input.classTimes,
      error: result.message
    });
  }

  req.session.flash = { type: 'ok', message: result.message };
  return res.redirect('/admin/courses');
});

router.get('/courses/:id/edit', (req, res, next) => {
  const course = adminService.getCourseForEdit(req.params.id);
  if (!course) {
    const err = new Error('课程不存在');
    err.status = 404;
    return next(err);
  }

  return renderCourseForm(req, res, {
    title: `编辑课程 · ${course.name}`,
    mode: 'edit',
    course,
    times: course.class_times
  });
});

router.post('/courses/:id', (req, res, next) => {
  const existing = adminService.getCourseForEdit(req.params.id);
  if (!existing) {
    const err = new Error('课程不存在');
    err.status = 404;
    return next(err);
  }

  const input = parseCourse(req.body, existing.id);
  const result = adminService.saveCourse(input);

  if (!result.ok) {
    return renderCourseForm(req, res, {
      title: `编辑课程 · ${existing.name}`,
      mode: 'edit',
      course: { ...input, id: existing.id, teacher_id: input.teacherId },
      times: input.classTimes,
      error: result.message
    });
  }

  req.session.flash = { type: 'ok', message: result.message };
  return res.redirect('/admin/courses');
});

router.post('/courses/:id/delete', (req, res) => {
  const result = adminService.deleteCourse(req.params.id);
  req.session.flash = { type: result.ok ? 'ok' : 'error', message: result.message };
  res.redirect('/admin/courses');
});

// ---------------------------------------------------------------- 选课窗口

router.get('/semester', (req, res) => {
  const semester = adminService.getCurrentSemester();
  res.render('admin/semester', {
    title: '选课窗口配置',
    semester,
    windowState: require('../services/windowService').getWindowState(semester),
    openAtLocal: adminService.toDateTimeLocal(semester && semester.select_open_at),
    closeAtLocal: adminService.toDateTimeLocal(semester && semester.select_close_at),
    error: null,
    fmt: format
  });
});

router.post('/semester', (req, res) => {
  const semester = adminService.getCurrentSemester();
  if (!semester) {
    req.session.flash = { type: 'error', message: '系统未配置学期，无法保存选课窗口' };
    return res.redirect('/admin/semester');
  }

  const result = adminService.saveWindow({
    semesterId: semester.id,
    openAt: req.body.openAt,
    closeAt: req.body.closeAt
  });

  if (!result.ok) {
    return res.status(400).render('admin/semester', {
      title: '选课窗口配置',
      semester,
      windowState: require('../services/windowService').getWindowState(semester),
      openAtLocal: String(req.body.openAt || ''),
      closeAtLocal: String(req.body.closeAt || ''),
      error: result.message,
      fmt: format
    });
  }

  req.session.flash = { type: 'ok', message: result.message };
  return res.redirect('/admin/semester');
});

// ---------------------------------------------------------------- 公告

router.get('/announcements', (req, res) => {
  res.render('admin/announcements', {
    title: '公告管理',
    announcements: announcementService.list({ limit: 100 }),
    error: null,
    form: { title: '', content: '', pinned: false },
    limits: { title: announcementService.TITLE_MAX, content: announcementService.CONTENT_MAX },
    fmt: format
  });
});

router.post('/announcements', (req, res) => {
  const result = announcementService.create({
    title: req.body.title,
    content: req.body.content,
    pinned: req.body.pinned === 'on' || req.body.pinned === '1',
    authorId: req.user.id
  });

  if (!result.ok) {
    return res.status(400).render('admin/announcements', {
      title: '公告管理',
      announcements: announcementService.list({ limit: 100 }),
      error: result.message,
      form: {
        title: String(req.body.title || ''),
        content: String(req.body.content || ''),
        pinned: req.body.pinned === 'on' || req.body.pinned === '1'
      },
      limits: { title: announcementService.TITLE_MAX, content: announcementService.CONTENT_MAX },
      fmt: format
    });
  }

  req.session.flash = { type: 'ok', message: result.message };
  return res.redirect('/admin/announcements');
});

router.post('/announcements/:id/delete', (req, res) => {
  const result = announcementService.remove(req.params.id);
  req.session.flash = { type: result.ok ? 'ok' : 'error', message: result.message };
  res.redirect('/admin/announcements');
});

router.post('/announcements/:id/pin', (req, res) => {
  const result = announcementService.togglePinned(req.params.id);
  req.session.flash = { type: result.ok ? 'ok' : 'error', message: result.message };
  res.redirect('/admin/announcements');
});

// ---------------------------------------------------------------- 选课统计

router.get('/enrollments', (req, res) => {
  const semester = adminService.getCurrentSemester();
  res.render('admin/enrollments', {
    title: '选课统计',
    semester,
    rows: semester ? adminService.enrollmentStats(semester.id) : [],
    fmt: format
  });
});

module.exports = router;
