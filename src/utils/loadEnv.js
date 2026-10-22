'use strict';

/**
 * 极简 .env 加载器（不引入 dotenv 依赖）
 *
 * 为什么需要它：
 *   项目约定「本地与线上共用 Neon PostgreSQL」，连接串只存在 `.env`（不入库）。
 *   但 `npm start` / `double-click start.bat` 启动的是 `src/server.js`，
 *   而 Node 不会自动读取 `.env`——只有显式的 `node --env-file=.env`（即 start:pg）才会。
 *   结果是：用户双击 start.bat 时永远回退到 SQLite，本地看不到云端数据。
 *
 * 规则：
 *   1. 只补缺失的键，**不覆盖**进程里已存在的环境变量（`DB_DRIVER=sqlite` 仍可强制离线）；
 *   2. 没有 `.env` 时静默跳过，保持「开箱即用、离线也能跑」；
 *   3. 支持 `#` 注释、`KEY=VALUE`、值两侧的单/双引号；
 *   4. 不解析多行值 / 变量插值——本项目用不到，保持简单可审计。
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

/**
 * 加载 .env（默认项目根目录）
 * @param {string} [file] 自定义路径
 * @returns {boolean} 是否读取到文件
 */
function loadEnv(file = path.join(ROOT_DIR, '.env')) {
  if (!fs.existsSync(file)) return false;

  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // 已显式设置的环境变量优先，绝不覆盖
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return true;
}

module.exports = { loadEnv };
