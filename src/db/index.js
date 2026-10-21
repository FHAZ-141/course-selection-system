'use strict';

/**
 * 数据库访问层入口（驱动分发器）
 *
 * 按环境变量选择实现：
 *   · 设置了 DATABASE_URL            → PostgreSQL（src/db/pg.js，异步）
 *   · 未设置                          → SQLite（src/db/sqlite.js，同步）
 *   · DB_DRIVER=pg | sqlite           → 强制指定（用于回归测试）
 *
 * 两个驱动对外暴露同一组方法：run / get / all / transaction / exec / initSchema / close
 *
 * ⚠️ 迁移期间注意：
 *   P0/P1 阶段业务代码仍是同步调用，因此只有 SQLite 驱动可用；
 *   PG 驱动（pg.js）在此阶段不会被加载，设置 DATABASE_URL 后才会生效。
 *
 * 回滚方式：删除 DATABASE_URL 环境变量即可回到 SQLite，无需改代码。
 */

const config = require('../config');

const usePg = config.db.driver === 'pg';

module.exports = usePg ? require('./pg') : require('./sqlite');
