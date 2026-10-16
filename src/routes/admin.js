'use strict';

const placeholder = require('./_placeholder');

module.exports = placeholder({
  title: '管理后台',
  roles: ['admin'],
  endpoints: [
    ['GET', '/admin', '管理后台首页（课程数、选课情况概览）'],
    ['GET|POST', '/admin/courses', '课程增删改（含容量上限、上课时间与单双周设置）'],
    ['GET|POST', '/admin/semester', '选课窗口配置（开放时间 / 截止时间）'],
    ['GET|POST', '/admin/announcements', '公告发布与管理'],
    ['GET', '/admin/enrollments', '各课程选课人数与候补情况统计']
  ]
});
