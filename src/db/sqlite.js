'use strict';

/**
 * 数据库访问层（SQLite / node-sqlite3-wasm）
 *
 * 这是**同步驱动**。对外接口形状与 `pg.js`（异步）保持一致，
 * 由 `src/db/index.js` 按环境变量二选一。
 *
 * ⚠️ 重要约束（踩坑记录）：
 * node-sqlite3-wasm 的 run/get/all 只接受「数组」或「对象」形式的参数。
 * 若写成 stmt.run(1, 'a')（可变参数），只有第一个参数会被绑定，
 * 其余参数会被静默忽略并存成 NULL —— 不报错，极难排查。
 * 因此本层统一把可变参数规整为数组后再传给驱动。
 */

const fs = require('node:fs');
const path = require('node:path');
const { Database } = require('node-sqlite3-wasm');
const config = require('../config');

let db = null;

function normalizeParams(args) {
  if (args.length === 0) return [];
  if (args.length === 1) {
    const only = args[0];
    if (only === undefined || only === null) return [];
    if (Array.isArray(only)) return only.map(clean);
    if (typeof only === 'object') return only;
    return [clean(only)];
  }
  return args.map(clean);
}

function clean(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function ensureDir(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * node-sqlite3-wasm 用「同名 .lock 目录」实现互斥（存在即代表被占用）。
 * 若进程在写事务中途被强杀（例如 Ctrl+C），该目录会残留，
 * 导致下次启动直接报 "database is locked"。
 * 这里在打开前做一次自愈清理。
 *
 * 注意：本项目为单进程本地应用，请勿同时启动多个实例。
 */
function releaseStaleLock() {
  const lockDir = `${config.db.file}.lock`;
  if (!fs.existsSync(lockDir)) return;
  try {
    fs.rmSync(lockDir, { recursive: true, force: true });
    console.warn(`[db] 检测到残留锁目录并已清理：${lockDir}`);
    console.warn('[db] 该残留通常由上次异常退出导致；请勿同时启动多个实例。');
  } catch (err) {
    console.warn(`[db] 残留锁目录清理失败，请手动删除目录：${lockDir}`);
    console.warn(`[db] 原因：${err.message}`);
  }
}

function getDb() {
  if (db) return db;

  ensureDir(config.db.file);
  releaseStaleLock();
  db = new Database(config.db.file);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function exec(sql) {
  return getDb().exec(sql);
}

/**
 * ⚠️ 必须使用 Database 级的 run/get/all（而非 prepare() 后自行调用），
 * 因为 Database 级方法内部会在 finally 中 finalize 语句。
 * 若用 db.prepare(sql).run(...) 而不 finalize：
 *   1) 写语句会一直持有写锁不放，导致后续操作报 "database is locked"；
 *   2) 残留的游标会让批量写入慢到不可接受。
 * 这两个坑都在本项目中真实踩到过，务必保持现状写法。
 */
function run(sql, ...params) {
  return getDb().run(sql, normalizeParams(params));
}

function get(sql, ...params) {
  return getDb().get(sql, normalizeParams(params));
}

function all(sql, ...params) {
  return getDb().all(sql, normalizeParams(params));
}

/**
 * 在事务中执行函数（**异步**，与 pg 驱动保持一致）。
 *
 * ⚠️ 必须 await fn()：
 * 若写成 `const result = fn(); d.exec('COMMIT')`，回调里的 await 还没跑完就提交了，
 * 事务等于没生效（P1 迁移时最容易踩的坑）。
 *
 * 默认使用 BEGIN IMMEDIATE：写事务一开始就取写锁，避免并发选课时的竞态
 * （对应需求 E2：并发控制 + 余量不超卖）。
 */
async function transaction(fn, mode = 'IMMEDIATE') {
  const d = getDb();
  d.exec(`BEGIN ${mode}`);
  try {
    const result = await fn();
    d.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      d.exec('ROLLBACK');
    } catch (_) {
      /* 回滚失败时保留原始异常 */
    }
    throw err;
  }
}

function initSchema() {
  const sql = fs.readFileSync(config.db.schemaFile, 'utf8');
  exec(sql);
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, exec, run, get, all, transaction, initSchema, close };
