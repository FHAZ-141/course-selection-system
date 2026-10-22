'use strict';

/**
 * 数据库访问层（PostgreSQL / node-postgres）
 *
 * 与 sqlite.js 暴露同一组方法：run / get / all / transaction / exec / initSchema / close
 * 差别只有一个：**本驱动是异步的**，所有方法返回 Promise。
 *
 * 三个关键设计（见 docs/dev/07-PostgreSQL迁移方案.md 第四节）：
 *
 * 1) 事务连接用 AsyncLocalStorage 隐式传递
 *    PG 的事务必须绑定在同一个连接上。若事务内仍走连接池，每次 query 可能拿到
 *    不同连接，事务就失效了。常规解法是把 client 一路作为参数传下去，但本项目的
 *    调用链会跨 3 个服务（enroll → conflictService → classTimeService），签名扩散太大。
 *    这里用 ALS 把当前事务的 client 绑到异步上下文，业务代码无需感知。
 *    → 规则只存在于本文件，不外泄。
 *
 * 2) INSERT 自动补 RETURNING id
 *    PG 没有 lastInsertRowid。这里在执行 INSERT 时自动追加 RETURNING id，
 *    并把结果映射回 { changes, lastInsertRowid }，保持与 SQLite 驱动一致的返回形状。
 *
 * 3) 占位符 ? → $1,$2,...
 *    现有 SQL 全部用 SQLite 的 ? 风格。本层统一转换，避免改 92 处调用点的 SQL。
 *    ⚠️ 若将来 SQL 中出现字面量问号（如 LIKE '%?%'），需改写为 ESCAPE 或参数化。
 */

const fs = require('node:fs');
const { AsyncLocalStorage } = require('node:async_hooks');
const { Pool, types } = require('pg');
const config = require('../config');

/**
 * 类型解析修正（与 SQLite 驱动保持一致的 JS 类型）：
 *
 * PostgreSQL 的 int8（bigint）默认被解析成**字符串**，而 SELECT COUNT(*) 返回的就是 int8。
 * 若不处理，业务代码里的 `count < capacity` 会变成字符串与数字比较（"112" < 45 恒为 false），
 * 表现为"所有课程都显示已满"、候补位次算出 NaN。
 *
 * 这里把 int8 解析为 Number —— 本项目所有计数都在 Number 安全范围内（< 2^53）。
 */
types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

/**
 * 参数规整（对齐 sqlite 驱动）：
 * · undefined → null：node-postgres 会把 undefined 当"未指定类型"发送，
 *   PG 无法推断时直接报 `could not determine data type of parameter $n`
 * · boolean → 0/1：本项目 schema 用 SMALLINT 存布尔（is_current / pinned）
 */
function normalizeParams(params) {
  return params.map(normalizeValue);
}

function normalizeValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

/** 当前异步上下文中的事务连接；不在事务内时为 undefined */
const txStorage = new AsyncLocalStorage();

let pool = null;

function getPool() {
  if (pool) return pool;

  if (!process.env.DATABASE_URL) {
    throw new Error('[db:pg] 未设置 DATABASE_URL，无法使用 PostgreSQL 驱动');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: config.db.pgPoolMax,
    // Neon 等托管 PG 要求 SSL；本地自建可设 PG_SSL=false 关闭
    ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
    // Neon 等托管 PG 会在服务端回收长时间空闲的连接。
    // 若本地池仍认为它可用，下一条查询就会拿到已断开的连接
    // （报 Connection terminated unexpectedly，页面表现为 500 或连接中断）。
    // 因此这里把空闲回收压到 10 秒，并开启 TCP keepAlive。
    idleTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5000,
    // Neon 免费版计算实例会在空闲 5 分钟后挂起，首次连接需等待唤醒（约 1.2 秒），
    // 这里给到 10 秒，避免唤醒期间误判为连接失败。
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    console.error('[db:pg] 空闲连接异常：', err.message);
  });

  return pool;
}

/** 事务内用绑定的 client，否则用连接池 */
function executor() {
  return txStorage.getStore() || getPool();
}

/** SQLite 的 ? 占位符 → PostgreSQL 的 $1,$2,... */
function toPgPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

/**
 * `user` 是 PostgreSQL 的保留字，直接写 `FROM user` 会语法错误，必须写成 `"user"`。
 *
 * 本项目有 30+ 处 SQL 涉及该表，逐条加引号既啰嗦又容易漏。
 * 这里只在**表位置**（FROM / JOIN / INTO / UPDATE 之后）加引号：
 *   · 不会误伤 `username`（单词边界不匹配）
 *   · 不会误伤字符串字面量（角色值是 'student'/'teacher'/'admin'）
 *
 * 若将来出现未覆盖的写法（报 `syntax error at or near "user"`），在 P2 阶段补规则。
 */
function quoteReservedIdentifiers(sql) {
  return sql.replace(/\b(FROM|JOIN|INTO|UPDATE)\s+user\b/gi, '$1 "user"');
}

/** 组合两步转换：保留字加引号 → 占位符改写 */
function toDriverSql(sql) {
  return toPgPlaceholders(quoteReservedIdentifiers(sql));
}

/**
 * 执行任意 SQL（DDL / 多语句）。
 * - PRAGMA 在 PG 中不存在，直接忽略（seed.js 里有 4 处 PRAGMA，保持代码不改）
 * - DROP TABLE 补 CASCADE（PG 删除被外键引用的表必须显式声明）
 */
async function exec(sql) {
  const text = String(sql).trim();
  if (/^PRAGMA\b/i.test(text)) return;

  const withCascade = text.replace(
    /DROP\s+TABLE\s+IF\s+EXISTS\s+("[^"]+")(?!\s+CASCADE)/gi,
    'DROP TABLE IF EXISTS $1 CASCADE'
  );

  await getPool().query(withCascade);
}

/**
 * 有自增 id 的表。只有 INSERT 进这些表时才补 `RETURNING id`。
 * `meta` 表主键是 key，没有 id 列 —— 若无条件追加会报 column "id" does not exist。
 */
const ID_TABLES = new Set(['user', 'semester', 'course', 'class_time', 'enrollment', 'announcement']);

/** 从 INSERT 语句里取目标表名（去掉引号），取不到返回 null */
function insertTargetTable(sql) {
  const m = /^\s*INSERT\s+INTO\s+("?)([A-Za-z_][A-Za-z0-9_]*)\1/i.exec(sql);
  return m ? m[2].toLowerCase() : null;
}

/**
 * 执行写语句。
 * 返回 { changes, lastInsertRowid }，与 SQLite 驱动保持一致。
 */
async function run(sql, ...params) {
  let text = sql;

  const isInsert = /^\s*INSERT\s+INTO/i.test(sql);
  const hasReturning = /\bRETURNING\b/i.test(sql);
  const table = insertTargetTable(sql);
  if (isInsert && !hasReturning && table && ID_TABLES.has(table)) {
    text = `${sql.trimEnd().replace(/;+\s*$/, '')} RETURNING id`;
  }

  const result = await executor().query(toDriverSql(text), normalizeParams(params));
  const firstRow = result.rows && result.rows[0];

  return {
    changes: result.rowCount,
    lastInsertRowid: firstRow ? firstRow.id : undefined
  };
}

/**
 * 连接被意外切断时的错误特征。
 * 这类错误重试是安全的**仅限读操作**：写操作若在提交后断开，重试可能造成重复写入。
 */
const TRANSIENT = /Connection terminated|ECONNRESET|connection error|Client has encountered|Client was closed|timeout exceeded/i;

async function queryWithRetry(text, params, retries = 1) {
  try {
    return await executor().query(text, params);
  } catch (err) {
    if (retries > 0 && TRANSIENT.test(err.message)) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return queryWithRetry(text, params, retries - 1);
    }
    throw err;
  }
}

/** 取单行；无结果返回 undefined（与 SQLite 驱动的行为一致） */
async function get(sql, ...params) {
  const result = await queryWithRetry(toDriverSql(sql), normalizeParams(params));
  return result.rows[0];
}

/** 取多行；无结果返回空数组 */
async function all(sql, ...params) {
  const result = await queryWithRetry(toDriverSql(sql), normalizeParams(params));
  return result.rows;
}

/**
 * 在事务中执行异步函数。
 * SQLite 版的第二个参数（'IMMEDIATE' 等）在 PG 中无对应语义，忽略即可。
 *
 * ⚠️ 并发注意：PG 的 BEGIN 不会加锁。需要串行化的写路径（选课/退课）
 * 必须在事务内显式 `SELECT ... FOR UPDATE` 锁住课程行 —— 见 P3。
 */
async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await txStorage.run(client, () => fn());
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* 回滚失败时保留原始异常 */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** 执行 schema.pg.sql 建表（幂等：全部使用 IF NOT EXISTS） */
async function initSchema() {
  const sql = fs.readFileSync(config.db.pgSchemaFile, 'utf8');
  await getPool().query(sql);
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  run,
  get,
  all,
  transaction,
  exec,
  initSchema,
  close,
  // 导出供单元测试使用（纯函数，无副作用）
  toPgPlaceholders,
  quoteReservedIdentifiers,
  toDriverSql
};
