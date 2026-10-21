'use strict';

/**
 * 公告路由（需求 D5）
 *
 * 三种角色都可查看；发布 / 删除 / 置顶在管理后台（/admin/announcements）里做。
 */

const express = require('express');
const announcementService = require('../services/announcementService');
const format = require('../utils/format');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.use(requireLogin);

/** 公告列表 */
router.get('/', async (req, res) => {
  res.render('announcement_list', {
    title: '公告通知',
    announcements: await announcementService.list({ limit: 50 }),
    fmt: format
  });
});

/** 公告详情 */
router.get('/:id', async (req, res, next) => {
  const announcement = await announcementService.get(req.params.id);
  if (!announcement) {
    const err = new Error('公告不存在或已被删除');
    err.status = 404;
    return next(err);
  }
  return res.render('announcement_detail', {
    title: announcement.title,
    announcement,
    fmt: format
  });
});

module.exports = router;
