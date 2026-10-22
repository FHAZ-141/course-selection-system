'use strict';

/**
 * 数据库连接质量探测
 *
 * 用途：页面顶部的小徽标要显示「云端库 / 延迟 / 离线」。
 * 设计取舍：
 *   · 后台每 15 秒主动执行一次 `SELECT 1`，把结果缓存下来——
 *     页面渲染时直接读缓存，不为每个请求额外加一次跨境查询（本地到 Neon 约 300~600ms）；
 *   · 探测失败不抛异常、不影响服务：只把状态标成「离线」；
 *     真正的业务查询失败仍由统一错误处理负责；
 *   · 定时器 `unref()`，不会阻止进程退出。
 */

const config = require('../config');
const db = require('../db');

const DEFAULT_INTERVAL_MS = 15000;

let state = {
  driver: config.db.driver,
  ok: null, // null = 还没探测过
  ms: null,
  checkedAt: null,
  error: null
};

let timer = null;
let inflight = null;

/** 执行一次探测并更新缓存 */
function probe() {
  if (inflight) return inflight;

  inflight = (async () => {
    const startedAt = Date.now();
    try {
      await db.get('SELECT 1 AS ok');
      state = {
        driver: config.db.driver,
        ok: true,
        ms: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        error: null
      };
    } catch (err) {
      state = {
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
  return { ...state };
}

module.exports = { probe, start, stop, getState };
