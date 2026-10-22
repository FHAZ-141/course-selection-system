'use strict';

const path = require('node:path');
const express = require('express');
const session = require('express-session');

const config = require('./config');
const db = require('./db');
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
//
// 字段含义：
//   ok     —— 进程存活（不包含数据库状态，避免 Neon 唤醒抖动导致平台误判重启）
//   node   —— 运行时版本（排查版本漂移）
//   commit —— Render 自动注入的部署提交（本地运行为 null）
//   db     —— 当前驱动 sqlite / pg
//   dbOk   —— **实际执行一次 SELECT 1** 的结果，用来确认"能连上库"
//   dbMs   —— 上述探测耗时（毫秒），可用来观察数据库延迟
//
// 注意：ok 与 dbOk 分开是有意的。若把数据库不可用算作 ok=false，
// Neon 免费版空闲唤醒（约 1 秒）期间的抖动可能让平台健康检查失败并触发重启。
app.get('/health', async (req, res) => {
  const body = {
    ok: true,
    service: 'course-selection-system',
    time: new Date().toISOString(),
    node: process.version,
    commit: process.env.RENDER_GIT_COMMIT || null,
    db: config.db.driver
  };

  try {
    const startedAt = Date.now();
    await db.get('SELECT 1 AS ok');
    body.dbOk = true;
    body.dbMs = Date.now() - startedAt;
  } catch (err) {
    body.dbOk = false;
    body.dbMs = null;
    body.dbError = String(err.message).slice(0, 140);
  }

  res.json(body);
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
