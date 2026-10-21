'use strict';

const path = require('node:path');
const express = require('express');
const session = require('express-session');

const config = require('./config');
const { attachUser } = require('./middleware/auth');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(config.rootDir, 'views'));
app.locals.appName = '选课系统';
app.locals.appVersion = require('../package.json').version;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(config.rootDir, 'public')));
app.use(session(config.session));
app.use(attachUser);

// 健康检查（并发压测脚本、部署健康探测、发布核对使用）
// 除 ok 外的字段都是**可观测信息**，用于确认"线上到底跑的是哪个提交、哪个 Node、哪个驱动"：
//   node   —— 运行时版本（排查版本漂移）
//   commit —— Render 自动注入的部署提交（本地运行为 null）
//   db     —— 当前数据库驱动 sqlite / pg（迁移期间快速核对）
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'course-selection-system',
    time: new Date().toISOString(),
    node: process.version,
    commit: process.env.RENDER_GIT_COMMIT || null,
    db: config.db.driver
  });
});

app.use('/', require('./routes/index'));
app.use('/', require('./routes/auth'));
app.use('/courses', require('./routes/courses'));
app.use('/enrollments', require('./routes/enrollments'));
app.use('/announcements', require('./routes/announcements'));
app.use('/admin', require('./routes/admin'));
app.use('/teacher', require('./routes/teacher'));

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: '页面不存在',
    code: 404,
    message: `未找到页面：${req.originalUrl}`
  });
});

// 统一错误处理
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;

  if (status >= 500) {
    // 服务端异常：需要完整堆栈，便于排查
    console.error('[error]', req.method, req.originalUrl, err);
  } else {
    // 4xx 属于正常的客户端错误（如访问不存在的课程），只记录一行即可
    console.warn('[warn]', req.method, req.originalUrl, `-> ${status}`, err.message);
  }

  res.status(status).render('error', {
    title: status >= 500 ? '服务器错误' : '请求有误',
    code: status,
    message: err.message || '服务器内部错误'
  });
});

module.exports = app;
