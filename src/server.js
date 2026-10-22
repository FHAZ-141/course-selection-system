'use strict';

// 先加载 .env：让 npm start / start.bat / node start.js 等所有入口
// 都能读到 DATABASE_URL，从而连到 Neon；没有 .env 时自动保持 SQLite 离线模式。
require('./utils/loadEnv').loadEnv();

const app = require('./app');
const config = require('./config');
const db = require('./db');
const dbStatus = require('./utils/dbStatus');

let server = null;

/**
 * 启动流程（异步：PostgreSQL 驱动的 initSchema / get 都是异步的）
 */
async function start() {
  await db.initSchema();

  // 空库自动初始化：initSchema 只建表不写数据，
  // 若此时放行，登录会以「密码不正确」的形式失败（实际是账号不存在），
  // 极难排查。这里直接补一次幂等的 seed。
  let userCount = (await db.get('SELECT COUNT(*) AS c FROM user')).c;
  if (userCount === 0) {
    console.log('数据库为空，正在写入演示数据…');
    const { execFileSync } = require('node:child_process');
    const path = require('node:path');
    execFileSync(process.execPath, [path.join(__dirname, 'db', 'seed.js')], {
      env: process.env,
      stdio: 'inherit'
    });
    userCount = (await db.get('SELECT COUNT(*) AS c FROM user')).c;
    if (userCount === 0) {
      console.warn('提示：演示数据写入失败，请手动执行  npm run init-db');
    }
  }

  // 后台每 15 秒探测一次数据库，供页面顶部的连接质量徽标使用
  dbStatus.start();

  server = app.listen(config.server.port, config.server.host, () => {
    const shown = config.server.host === '0.0.0.0' ? 'localhost' : config.server.host;
    console.log('==============================================');
    console.log('  选课系统已启动');
    console.log(`  本机访问：http://${shown}:${config.server.port}`);
    console.log(`  演示账号：admin / T1001 / 2024010101，密码均为 123456`);
    console.log('  按 Ctrl+C 停止服务');
    console.log('==============================================');
  });
}

function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭服务…`);
  if (!server) {
    process.exit(0);
    return;
  }
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('启动失败：', err);
  if (process.env.DATABASE_URL) {
    console.error('提示：检测到 DATABASE_URL，当前尝试连接云端数据库（Neon/PostgreSQL）。');
    console.error('      · 请检查 .env 中的连接串是否失效、Neon 实例是否唤醒、本机网络是否可达；');
    console.error('      · 若只想离线运行，可设置环境变量 DB_DRIVER=sqlite（或临时移走 .env）。');
  }
  process.exitCode = 1;
});
