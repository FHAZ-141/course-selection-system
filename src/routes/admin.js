'use strict';

/**
 * 管理后台路由（规则 R8）
 *
 * 只做四件事：取参数 → 整理成结构化数据 → 调服务 → 渲染或重定向。
 * 业务校验在 src/services/adminService.js，公告相关复用 announcementService。
 */

const express = require('express');
const adminService = require('../services/adminService');
const { setFlash } = require('../utils/flash');
const announcementService = require('../services/announcementService');
const enrollmentService = require('../services/enrollmentService');
const format = require('../utils/format');
const { flashAndBack } = require('../utils/flash');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireLogin, requireRole('admin'));

/** 把表单里并列的排课数组拼成结构化数据 */
async function parseClassTimes(body) {
  const days = await adminService.toArray(body.ct_day);
  const starts = await adminService.toArray(body.ct_start);
  const ends = await adminService.toArray(body.ct_end);
  const weekTypes = await adminService.toArray(body.ct_week_type);
  const startWeeks = await adminService.toArray(body.ct_start_week);
  const endWeeks = await adminService.toArray(body.ct_end_week);

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
async function parseCourse(body, courseId) {
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
    classTimes: await parseClassTimes(body)
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
async function renderCourseForm(req, res, options) {
  const semester = await adminService.getCurrentSemester();
  res.render('admin/course_form', {
    title: options.title,
    mode: options.mode,
    course: normalizeCourse(options.course),
    times: normalizeTimes(options.times),
    error: options.error || null,
    semester,
    teachers: await adminService.listTeachers(),
    departments: await adminService.listDepartments(semester ? semester.id : 0),
    weekTypes: adminService.weekTypes,
    fmt: format
  });
}

// ---------------------------------------------------------------- 概览

router.get('/', async (req, res) => {
  const semester = await adminService.getCurrentSemester();
  res.render('admin/overview', {
    title: '管理后台',
    semester,
    windowState: require('../services/windowService').getWindowState(semester),
    stats: semester ? await adminService.overview(semester.id) : null,
    fmt: format
  });
});

// ---------------------------------------------------------------- 账号管理

router.get('/accounts', async (req, res) => {
  const query = String(req.query.q || '').trim();
  const role = String(req.query.role || '').trim();
  res.render('admin/accounts', {
    title: '账号管理',
    accounts: await adminService.listAccounts({ query, role }),
    query,
    role
  });
});

router.get('/accounts/new', (req, res) => {
  res.render('admin/account_form', {
    title: '注册账号',
    mode: 'create',
    account: { username: '', name: '', role: 'student', department: '', grade: '' },
    error: null
  });
});

router.post('/accounts', async (req, res) => {
  const input = {
    username: req.body.username,
    name: req.body.name,
    role: req.body.role,
    department: req.body.department,
    grade: req.body.grade,
    password: req.body.password
  };
  const result = await adminService.createAccount(input);
  if (!result.ok) {
    return res.status(400).render('admin/account_form', {
      title: '注册账号', mode: 'create', account: { ...input, password: undefined }, error: result.message
    });
  }
  setFlash(req, { ok: true, message: result.message });
  return res.redirect('/admin/accounts');
});

router.get('/accounts/:id/edit', async (req, res, next) => {
  const account = await adminService.getAccount(req.params.id);
  if (!account) {
    const err = new Error('账号不存在');
    err.status = 404;
    return next(err);
  }
  return res.render('admin/account_form', {
    title: `编辑账号 · ${account.username}`, mode: 'edit', account, error: null
  });
});

router.post('/accounts/:id', async (req, res, next) => {
  const input = {
    id: req.params.id,
    username: req.body.username,
    name: req.body.name,
    role: req.body.role,
    department: req.body.department,
    grade: req.body.grade
  };
  const result = await adminService.updateAccount(input, req.user.id);
  if (!result.ok) {
    const account = { ...input, id: Number(req.params.id) };
    return res.status(400).render('admin/account_form', {
      title: '编辑账号', mode: 'edit', account, error: result.message
    });
  }
  if (Number(req.params.id) === Number(req.user.id)) {
    req.session.user = { ...req.session.user, username: result.data.username, name: result.data.name };
  }
  setFlash(req, { ok: true, message: result.message });
  return res.redirect('/admin/accounts');
});

router.post('/accounts/:id/password', async (req, res) => {
  const result = await adminService.resetAccountPassword(req.params.id, req.body.password);
  setFlash(req, { ok: result.ok, message: result.message, detail: result.code });
  return res.redirect(`/admin/accounts/${encodeURIComponent(req.params.id)}/edit`);
});

router.post('/accounts/:id/delete', async (req, res) => {
  const result = await adminService.deleteAccount(req.params.id, req.user.id);
  setFlash(req, { ok: result.ok, message: result.message, detail: result.code });
  return res.redirect('/admin/accounts');
});

// ---------------------------------------------------------------- 课程

router.get('/courses', async (req, res) => {
  const semester = await adminService.getCurrentSemester();
  res.render('admin/course_list', {
    title: '课程管理',
    semester,
    courses: semester ? await adminService.listCourses(semester.id) : [],
    fmt: format
  });
});

router.get('/courses/new', async (req, res) => {
  await renderCourseForm(req, res, {
    title: '新增课程',
    mode: 'create',
    course: { status: 'open', credits: 2, capacity: 40 },
    times: []
  });
});

router.post('/courses', async (req, res) => {
  const input = await parseCourse(req.body, null);
  const result = await adminService.saveCourse(input);

  if (!result.ok) {
    return await renderCourseForm(req, res, {
      title: '新增课程',
      mode: 'create',
      course: { ...input, teacher_id: input.teacherId },
      times: input.classTimes,
      error: result.message
    });
  }

  setFlash(req, { ok: true, message: result.message });
  return res.redirect('/admin/courses');
});

router.get('/courses/:id/edit', async (req, res, next) => {
  const course = await adminService.getCourseForEdit(req.params.id);
  if (!course) {
    const err = new Error('课程不存在');
    err.status = 404;
    return next(err);
  }

  return await renderCourseForm(req, res, {
    title: `编辑课程 · ${course.name}`,
    mode: 'edit',
    course,
    times: course.class_times
  });
});

router.post('/courses/:id', async (req, res, next) => {
  const existing = await adminService.getCourseForEdit(req.params.id);
  if (!existing) {
    const err = new Error('课程不存在');
    err.status = 404;
    return next(err);
  }

  const input = await parseCourse(req.body, existing.id);
  const result = await adminService.saveCourse(input);

  if (!result.ok) {
    return await renderCourseForm(req, res, {
      title: `编辑课程 · ${existing.name}`,
      mode: 'edit',
      course: { ...input, id: existing.id, teacher_id: input.teacherId },
      times: input.classTimes,
      error: result.message
    });
  }

  setFlash(req, { ok: true, message: result.message });
  return res.redirect('/admin/courses');
});

router.post('/courses/:id/delete', async (req, res) => {
  const result = await adminService.deleteCourse(req.params.id);
  setFlash(req, { ok: result.ok, message: result.message, detail: result.code });
  res.redirect('/admin/courses');
});

router.get('/courses/:id/enrollments', async (req, res, next) => {
  const data = await adminService.getCourseEnrollmentManagement(req.params.id);
  if (!data) {
    const err = new Error('课程不存在');
    err.status = 404;
    return next(err);
  }
  return res.render('admin/course_enrollments', {
    title: `选课管理 · ${data.course.name}`,
    course: data.course,
    enrolled: data.enrolled,
    waiting: data.waiting,
    fmt: format
  });
});

router.post('/courses/:id/enrollments', async (req, res) => {
  const result = await enrollmentService.adminEnroll(req.body.username, req.params.id);
  return flashAndBack(req, res, result, `/admin/courses/${encodeURIComponent(req.params.id)}/enrollments`);
});

router.post('/courses/:id/enrollments/:studentId/drop', async (req, res) => {
  const result = await enrollmentService.adminChangeEnrollment(req.params.studentId, req.params.id, 'drop');
  return flashAndBack(req, res, result, `/admin/courses/${encodeURIComponent(req.params.id)}/enrollments`);
});

router.post('/courses/:id/enrollments/:studentId/cancel-waitlist', async (req, res) => {
  const result = await enrollmentService.adminChangeEnrollment(req.params.studentId, req.params.id, 'cancel-waitlist');
  return flashAndBack(req, res, result, `/admin/courses/${encodeURIComponent(req.params.id)}/enrollments`);
});

// ---------------------------------------------------------------- 选课窗口

router.get('/semester', async (req, res) => {
  const semester = await adminService.getCurrentSemester();
  res.render('admin/semester', {
    title: '选课窗口配置',
    semester,
    windowState: require('../services/windowService').getWindowState(semester),
    openAtLocal: await adminService.toDateTimeLocal(semester && semester.select_open_at),
    closeAtLocal: await adminService.toDateTimeLocal(semester && semester.select_close_at),
    error: null,
    fmt: format
  });
});

router.post('/semester', async (req, res) => {
  const semester = await adminService.getCurrentSemester();
  if (!semester) {
    setFlash(req, { ok: false, message: '系统未配置学期，无法保存选课窗口', detail: 'SEMESTER_NOT_CONFIGURED' });
    return res.redirect('/admin/semester');
  }

  const result = await adminService.saveWindow({
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

  setFlash(req, { ok: true, message: result.message });
  return res.redirect('/admin/semester');
});

// ---------------------------------------------------------------- 公告

router.get('/announcements', async (req, res) => {
  res.render('admin/announcements', {
    title: '公告管理',
    announcements: await announcementService.list({ limit: 100 }),
    error: null,
    form: { title: '', content: '', pinned: false },
    limits: { title: announcementService.TITLE_MAX, content: announcementService.CONTENT_MAX },
    fmt: format
  });
});

router.post('/announcements', async (req, res) => {
  const result = await announcementService.create({
    title: req.body.title,
    content: req.body.content,
    pinned: req.body.pinned === 'on' || req.body.pinned === '1',
    authorId: req.user.id
  });

  if (!result.ok) {
    return res.status(400).render('admin/announcements', {
      title: '公告管理',
      announcements: await announcementService.list({ limit: 100 }),
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

  setFlash(req, { ok: true, message: result.message });
  return res.redirect('/admin/announcements');
});

router.post('/announcements/:id/delete', async (req, res) => {
  const result = await announcementService.remove(req.params.id);
  setFlash(req, { ok: result.ok, message: result.message, detail: result.code });
  res.redirect('/admin/announcements');
});

router.post('/announcements/:id/pin', async (req, res) => {
  const result = await announcementService.togglePinned(req.params.id);
  setFlash(req, { ok: result.ok, message: result.message, detail: result.code });
  res.redirect('/admin/announcements');
});

// ---------------------------------------------------------------- 选课统计

router.get('/enrollments', async (req, res) => {
  const semester = await adminService.getCurrentSemester();
  res.render('admin/enrollments', {
    title: '选课统计',
    semester,
    rows: semester ? await adminService.enrollmentStats(semester.id) : [],
    fmt: format
  });
});

module.exports = router;
