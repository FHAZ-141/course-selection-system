'use strict';

/**
 * 数据库连接质量探测
 *
 * 用途：
 *   · 页面顶部徽标显示「云端库 / 延迟 / 离线」；
 *   · 悬停详情卡展示服务端具体情况（目标库、主机、区域、最近几次延迟、检测时间等）；
 *   · 提供「立即检测」按钮，点击即真实执行一次 SELECT 1。
 *
 * 设计取舍：
 *   · 后台每 15 秒主动探测一次，供页面首屏渲染直接读缓存，不为每个请求加一次跨境查询；
 *   · 前端打开页面后每 5 秒请求 /health（真实探测），保证显示的延迟与实际一致；
 *   · 探测失败不抛异常、不影响服务：只把状态标成「离线」；
 *   · 定时器 unref()，不阻止进程退出。
 */

const config = require('../config');
const db = require('../db');

const DEFAULT_INTERVAL_MS = 15000;
const HISTORY_SIZE = 5;

let state = {
  driver: config.db.driver,
  ok: null, // null = 还没探测过
  ms: null,
  checkedAt: null,
  error: null,
  history: []
};

let timer = null;
let inflight = null;

/** 从连接串里提取可展示的目标信息（不含口令） */
function targetInfo() {
  if (config.db.driver !== 'pg') {
    return {
      label: 'SQLite（本地文件）',
      host: config.db.file,
      region: null
    };
  }

  const raw = process.env.DATABASE_URL || '';
  try {
    const url = new URL(raw);
    const hostname = url.hostname || '';
    // 区域：ap-southeast-1 / us-east-1 之类
    const regionMatch = hostname.match(/((?:ap|us|eu|sa|ca|me|af)-[a-z]+-\d)/);
    return {
      label: 'PostgreSQL（Neon / 连接池）',
      host: maskHost(hostname),
      region: regionMatch ? regionMatch[1] : null
    };
  } catch (_) {
    return { label: 'PostgreSQL', host: null, region: null };
  }
}

/** 把主机名里随机的一段打码，避免把完整端点暴露在页面上 */
function maskHost(hostname) {
  if (!hostname) return null;
  const parts = hostname.split('.');
  if (parts.length < 2) return '***';
  const first = parts[0];
  const maskedFirst =
    first.length > 8 ? `${first.slice(0, 5)}***${first.slice(-3)}` : `${first.slice(0, 2)}***`;
  return [maskedFirst, ...parts.slice(1)].join('.');
}

/** 执行一次探测并更新缓存 */
function probe() {
  if (inflight) return inflight;

  inflight = (async () => {
    const startedAt = Date.now();
    try {
      await db.get('SELECT 1 AS ok');
      const ms = Date.now() - startedAt;
      const history = [...state.history, ms].slice(-HISTORY_SIZE);
      state = {
        driver: config.db.driver,
        ok: true,
        ms,
        checkedAt: new Date().toISOString(),
        error: null,
        history
      };
    } catch (err) {
      state = {
        ...state,
        driver: config.db.driver,
        ok: false,
        ms: null,
        checkedAt: new Date().toISOString(),
        error: String((err && err.message) || err).slice(0, 120)
      };
    } finally {
      inflight = null;
    }
    return state;
  })();

  return inflight;
}

/** 启动后台探测（幂等） */
function start(intervalMs = DEFAULT_INTERVAL_MS) {
  if (timer) return;
  probe();
  timer = setInterval(probe, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** 取当前缓存状态（渲染层使用，不触发查询） */
function getState() {
  return {
    ...state,
    history: [...state.history],
    target: targetInfo()
  };
}

module.exports = {
  probe,
  start,
  stop,
  getState,
  intervalMs: DEFAULT_INTERVAL_MS
};
