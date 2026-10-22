'use strict';

/**
 * 写操作的结果提示（flash）
 *
 * 为什么要有这个工具：
 *   数据库在云端，"操作成功"意味着数据已经落库，但用户看不到这一点。
 *   这里把**落点**（云端 PostgreSQL / 本地 SQLite）和时间一起带给页面，
 *   让每次写操作都有明确回执，避免"到底存上去了没有"的疑虑。
 *
 * 约定：
 *   成功 → type=ok   + target（已写入哪）+ at（时间）
 *   失败 → type=error + detail（错误码）+ 页面提示"本次操作未生效"
 */

const config = require('../config');
const { safeInternalPath } = require('./url');

/** 当前数据落点的人类可读名称 */
function targetLabel() {
  return config.db.driver === 'pg'
    ? '云端数据库 PostgreSQL'
    : '本地数据库 SQLite';
}

function nowText() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * 写入一条闪现提示（配合 POST + 重定向使用，只显示一次）
 * @param {object} req
 * @param {{ok: boolean, message: string, detail?: string|null}} result
 */
function setFlash(req, { ok, message, detail = null, persisted = true }) {
  // 只有真正落库的操作才显示「已写入 <库>」；登录这类只读 + 建会话的操作传 persisted:false
  const showTarget = ok && persisted;
  req.session.flash = {
    type: ok ? 'ok' : 'error',
    message,
    detail: ok ? null : detail,
    target: showTarget ? targetLabel() : null,
    at: showTarget ? nowText() : null
  };
}

/**
 * 业务结果 { ok, code, message } → 提示并回跳到来源页
 */
function flashAndBack(req, res, result, fallback) {
  setFlash(req, {
    ok: result.ok,
    message: result.message,
    detail: result.code
  });
  res.redirect(safeInternalPath(req.body.back, fallback));
}

module.exports = { setFlash, flashAndBack, targetLabel };
