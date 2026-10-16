'use strict';

/**
 * 占位路由工厂。
 *
 * v0.1.0 只搭骨架：各业务模块先登记「计划实现的接口清单」，
 * 让 URL 结构与模块边界在骨架阶段就固定下来；
 * 具体业务逻辑在 v0.2.0 实现。
 */

const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');

module.exports = function placeholderRouter({ title, roles, endpoints }) {
  const router = express.Router();

  router.use(requireLogin, requireRole(...roles));

  router.all('/', (req, res) => {
    res.render('placeholder', { title, endpoints });
  });

  return router;
};
