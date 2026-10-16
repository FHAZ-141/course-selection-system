'use strict';

const config = require('../config');

/** 把当前登录用户与公共视图变量注入每次请求 */
function attachUser(req, res, next) {
  req.user = (req.session && req.session.user) || null;
  res.locals.currentUser = req.user;
  res.locals.roles = config.roles;
  res.locals.weekTypes = config.weekTypes;
  res.locals.periods = config.periods;
  res.locals.activePath = req.path;
  next();
}

function requireLogin(req, res, next) {
  if (req.user) return next();

  if (req.method === 'GET') {
    const next_ = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?next=${next_}`);
  }
  return res.status(401).json({ ok: false, message: '请先登录' });
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
