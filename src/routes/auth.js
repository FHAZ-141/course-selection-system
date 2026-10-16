'use strict';

const express = require('express');
const db = require('../db');
const { verifyPassword } = require('../utils/password');

const router = express.Router();

/** 只允许跳回站内路径，避免开放重定向 */
function safeNext(next) {
  if (typeof next !== 'string') return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', {
    title: '登录',
    error: null,
    username: '',
    next: safeNext(req.query.next)
  });
});

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const next = safeNext(req.body.next);

  const user = db.get('SELECT * FROM user WHERE username = ?', username);

  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return res.status(401).render('login', {
      title: '登录',
      error: '学号 / 工号或密码不正确',
      username,
      next
    });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    department: user.department,
    grade: user.grade
  };

  return res.redirect(next);
});

function logout(req, res) {
  req.session.destroy(() => res.redirect('/login'));
}

router.post('/logout', logout);
router.get('/logout', logout);

module.exports = router;
