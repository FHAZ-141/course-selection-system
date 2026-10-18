#!/usr/bin/env node
'use strict';

/**
 * 一键启动器
 *
 * 做四件事：
 *   1. 检查依赖，缺了就自动执行 npm install
 *   2. 检查数据库，没有就自动初始化演示数据
 *   3. 启动服务（独立子进程，沿用 src/server.js 的日志与优雅退出）
 *   4. 等服务就绪后自动打开浏览器
 *
 * 用法：
 *   node start.js               正常启动并打开浏览器
 *   node start.js --no-browser  只启动服务，不开浏览器（服务器/调试用）
 *   node start.js --skip-install 跳过自动装依赖（离线环境）
 *
 * 环境变量：
 *   PORT   指定端口，默认 3000。端口被占用时会自动往后找可用端口。
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const ROOT = __dirname;
const SERVICE = 'course-selection-system';
const BASE_PORT = Number(process.env.PORT) || 3000;
const PORT_SEARCH_LIMIT = 10;
const HEALTH_TIMEOUT_MS = 30000;

const argv = process.argv.slice(2);
const noBrowser = argv.includes('--no-browser');
const skipInstall = argv.includes('--skip-install');

const WIDTH = 56;

function line(char = '─') {
  return char.repeat(WIDTH);
}

function say(msg = '') {
  console.log(msg);
}

function step(icon, msg) {
  console.log(`  ${icon}  ${msg}`);
}

function fatal(message, hint) {
  say();
  say(`  ❌ ${message}`);
  if (hint) say(`     ${hint}`);
  say();
  process.exitCode = 1;
  return 1;
}

/** 访问本机某个端口的 /health，返回解析后的 JSON 或 null */
function probeHealth(port, timeout = 1500) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/health', timeout },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch (_) {
            resolve(null);
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

/** 端口是否可用 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

/** 用系统默认浏览器打开 URL */
function openBrowser(url) {
  const platform = process.platform;
  let command;
  let args;

  if (platform === 'win32') {
    // start 会把第一个带引号的参数当成窗口标题，故留一个空标题占位
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch (_) {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 依赖检查：缺失时自动安装 */
function ensureDependencies() {
  const nodeModules = path.join(ROOT, 'node_modules');
  if (fs.existsSync(nodeModules)) {
    step('✓', '依赖已就绪');
    return true;
  }

  if (skipInstall) {
    step('✗', '缺少依赖目录 node_modules');
    return false;
  }

  step('…', '未检测到依赖，正在自动安装（首次运行需联网，请稍候）');
  say();
  const result = spawnSync('npm install --no-audit --no-fund', {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true
  });
  say();

  if (result.status !== 0) {
    step('✗', '依赖安装失败');
    return false;
  }
  step('✓', '依赖安装完成');
  return true;
}

/** 数据库检查：缺失时自动初始化 */
function ensureDatabase() {
  const dbFile = path.join(ROOT, 'data', 'course-selection.sqlite');
  if (fs.existsSync(dbFile)) {
    step('✓', '数据库已就绪');
    return true;
  }

  step('…', '首次运行，正在初始化演示数据');
  const result = spawnSync(process.execPath, [path.join(ROOT, 'src', 'db', 'seed.js')], {
    cwd: ROOT,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    step('✗', '数据库初始化失败');
    return false;
  }
  step('✓', '演示数据已就绪');
  return true;
}

/** 选择可用端口：先看是否已有本服务在跑，再找空闲端口 */
async function resolvePort() {
  const existing = await probeHealth(BASE_PORT);
  if (existing && existing.json && existing.json.service === SERVICE) {
    return { alreadyRunning: true, port: BASE_PORT };
  }

  for (let port = BASE_PORT; port < BASE_PORT + PORT_SEARCH_LIMIT; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) {
      if (port !== BASE_PORT) {
        step('!', `端口 ${BASE_PORT} 已被其他程序占用，改用 ${port}`);
      }
      return { alreadyRunning: false, port };
    }
  }

  return { alreadyRunning: false, port: null };
}

/** 等待服务就绪 */
async function waitForHealthy(port) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const res = await probeHealth(port, 1000);
    if (res && res.json && res.json.service === SERVICE) return true;
    // eslint-disable-next-line no-await-in-loop
    await sleep(400);
  }
  return false;
}

async function main() {
  const pkg = require('./package.json');

  say();
  say(line('═'));
  say(`  高校选课系统  v${pkg.version}`);
  say(line('═'));
  say();

  // 1. 依赖
  if (!ensureDependencies()) {
    return fatal(
      '无法继续：依赖不完整',
      '请手动在项目目录执行：npm install（若网络慢可先设置国内镜像源）'
    );
  }

  // 2. 数据库
  if (!ensureDatabase()) {
    return fatal('无法继续：数据库未初始化', '请手动在项目目录执行：npm run init-db');
  }

  // 3. 端口与运行状态
  const { alreadyRunning, port } = await resolvePort();

  if (alreadyRunning) {
    const url = `http://localhost:${port}`;
    step('✓', `服务已在运行：${url}`);
    if (!noBrowser) openBrowser(url);
    say();
    say(line());
    say(`  直接在浏览器访问：${url}`);
    say('  如需停止服务，请关闭原来那个命令行窗口。');
    say(line());
    say();
    return 0;
  }

  if (!port) {
    return fatal(
      `端口 ${BASE_PORT}~${BASE_PORT + PORT_SEARCH_LIMIT - 1} 均被占用`,
      '请关闭占用端口的程序，或先设置环境变量 PORT 再运行'
    );
  }

  const url = `http://localhost:${port}`;

  // 4. 启动服务子进程
  say();
  const server = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, PORT: String(port) }
  });

  server.on('error', (err) => {
    fatal('服务启动失败', err.message);
    process.exit(1);
  });

  server.on('exit', (code) => {
    say();
    say(`  服务已停止（退出码 ${code === null ? '未知' : code}）。可以关闭本窗口。`);
    say();
    process.exit(code === null ? 0 : code);
  });

  // 把信号转发给子进程，避免关窗口/被 kill 时留下孤儿进程
  const forward = (signal) => {
    if (!server.killed) {
      try {
        server.kill(signal);
      } catch (_) {
        /* 子进程可能已退出 */
      }
    }
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));

  // 5. 就绪后打开浏览器
  const healthy = await waitForHealthy(port);

  if (!healthy) {
    say();
    say('  ⚠️  服务在 30 秒内没有就绪，常见原因：');
    say('     · 数据库被另一个进程占用（请关掉其他正在运行的本程序窗口）');
    say('     · 端口冲突');
    say('     请查看上方的错误输出。');
    return 0;
  }

  if (!noBrowser) {
    openBrowser(url);
    say();
    say(line());
    say(`  ✅ 已在浏览器中打开：${url}`);
    say('  若浏览器没有自动弹出，请手动复制上面的地址访问。');
    say();
    say('  演示账号（密码均为 123456）：');
    say('    管理员  admin');
    say('    教师    T1001');
    say('    学生    2024010101');
    say(line());
    say('  关闭服务：在本窗口按 Ctrl + C');
    say();
  }

  return 0;
}

main().catch((err) => {
  console.error();
  console.error('  启动器异常：', err && err.message ? err.message : err);
  console.error();
  process.exitCode = 1;
});
