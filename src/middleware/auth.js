'use strict';

const config = require('../config');

/** 把当前登录用户、闪现提示与公共视图变量注入每次请求 */
function attachUser(req, res, next) {
  req.user = (req.session && req.session.user) || null;
  res.locals.currentUser = req.user;
  res.locals.roles = config.roles;
  res.locals.weekTypes = config.weekTypes;
  res.locals.periods = config.periods;
  res.locals.activePath = req.path;

  // 闪现提示：取出后立即清空，保证只显示一次（配合 POST + 重定向使用）
  res.locals.flash = (req.session && req.session.flash) || null;
  if (req.session && req.session.flash) delete req.session.flash;

  next();
}

function requireLogin(req, res, next) {
  if (req.user) return next();

  // 明确要求 JSON 的调用方（如压测脚本）返回 401 JSON
  const wantsJson =
    (req.get('accept') || '').includes('application/json') ||
    req.get('x-requested-with') === 'XMLHttpRequest';
  if (wantsJson) {
    return res.status(401).json({ ok: false, message: '请先登录' });
  }

  // 表单请求（包括 POST）一律跳登录页，避免用户看到裸 JSON。
  // 非 GET 请求登录后无法重放（没有对应的 GET 路由），因此跳回首页。
  const target = req.method === 'GET' ? req.originalUrl : '/';
  return res.redirect(`/login?next=${encodeURIComponent(target)}`);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (!roles.includes(req.user.role)) {
      return res.status(403).render('error', {
        title: '无权访问',
        code: 403,
        message: `当前角色（${config.roles[req.user.role] || req.user.role}）无权访问该页面`
      });
    }
    return next();
  };
}

module.exports = { attachUser, requireLogin, requireRole };
