'use strict';

const crypto = require('node:crypto');

const KEY_LENGTH = 64;

/**
 * 使用 Node 内置 scrypt 做口令派生与校验。
 * 不引入 bcrypt 等需要原生编译的依赖（本机缺少编译工具链）。
 */

function hashPassword(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(plain, salt, KEY_LENGTH).toString('hex');
  return { salt, hash };
}

function verifyPassword(plain, salt, expectedHash) {
  if (!plain || !salt || !expectedHash) return false;
  const actual = crypto.scryptSync(plain, salt, KEY_LENGTH).toString('hex');
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { hashPassword, verifyPassword };
