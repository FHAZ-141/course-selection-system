'use strict';

/**
 * 选课 / 退课路由（需求 §2.1-2/3/6，B4 候补）
 *
 * 一律采用 POST + 重定向（PRG）：提交后重定向回来源页，
 * 提示信息通过 session 中的 flash 传递，避免刷新导致重复提交。
 */

const express = require('express');
const enrollmentService = require('../services/enrollmentService');
const { flashAndBack } = require('../utils/flash');
const format = require('../utils/format');
const { safeInternalPath } = require('../utils/url');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

// 选课与退课只对学生开放
router.use(requireLogin, requireRole('student'));

/** 把服务层结果转成 flash 提示，并跳回来源页 */
// 结果提示统一由 utils/flash 处理（成功会带上"已写入云端"回执）
// 这里保留同名函数，调用点无需改动。

/** 我的选课结果（§2.1-6） */
router.get('/my', async (req, res) => {
  const data = await enrollmentService.listMyEnrollments(req.user.id);
  res.render('my_enrollments', {
    title: '我的选课',
    enrolled: data.enrolled,
    waiting: data.waiting,
    totalCredits: data.totalCredits,
    fmt: format
  });
});

/** 选课（满员自动转候补） */
router.post('/', async (req, res) => {
  const result = await enrollmentService.enroll(req.user.id, req.body.courseId);
  flashAndBack(req, res, result, '/courses');
});

/** 退课（触发候补自动补位） */
router.post('/:courseId/drop', async (req, res) => {
  const result = await enrollmentService.drop(req.user.id, req.params.courseId);
  flashAndBack(req, res, result, '/enrollments/my');
});

/** 主动退出候补队列 */
router.post('/:courseId/waitlist/cancel', async (req, res) => {
  const result = await enrollmentService.cancelWaitlist(req.user.id, req.params.courseId);
  flashAndBack(req, res, result, '/enrollments/my');
});

module.exports = router;
