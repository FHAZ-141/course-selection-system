'use strict';

/**
 * URL 工具
 */

/**
 * 只允许跳回站内路径，避免开放重定向漏洞。
 * 拒绝绝对地址（http://…）、协议相对地址（//evil.com）与空值。
 *
 * @param {string} value   待校验的路径
 * @param {string} fallback 非法时的兜底路径
 */
function safeInternalPath(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//')) return fallback;
  if (trimmed.includes('\\')) return fallback;
  return trimmed;
}

module.exports = { safeInternalPath };
