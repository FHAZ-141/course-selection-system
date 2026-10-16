'use strict';

const placeholder = require('./_placeholder');

module.exports = placeholder({
  title: '公告通知',
  roles: ['student', 'teacher', 'admin'],
  endpoints: [
    ['GET', '/announcements', '公告列表（置顶优先，按发布时间倒序）'],
    ['GET', '/announcements/:id', '公告详情']
  ]
});
