'use strict';

const app = require('./app');
const config = require('./config');
const db = require('./db');

let server = null;

/**
 * 启动流程（异步：PostgreSQL 驱动的 initSchema / get 都是异步的）
 */
async function start() {
  await db.initSchema();

  const { c: userCount } = await db.get('SELECT COUNT(*) AS c FROM user');
  if (userCount === 0) {
    console.warn('提示：数据库中还没有数据，请先执行  npm run init-db');
  }

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
  process.exitCode = 1;
});
