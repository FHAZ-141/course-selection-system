'use strict';

const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');

module.exports = {
  rootDir: ROOT_DIR,

  server: {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0'
  },

  session: {
    secret: process.env.SESSION_SECRET || 'course-selection-system-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000
    }
  },

  db: {
    // 驱动选择（见 src/db/index.js）：
    //   · DB_DRIVER=pg|sqlite  显式指定（用于回归测试）
    //   · 否则：设置了 DATABASE_URL 走 PostgreSQL，未设置回退 SQLite
    driver:
      process.env.DB_DRIVER === 'pg' || process.env.DB_DRIVER === 'sqlite'
        ? process.env.DB_DRIVER
        : (process.env.DATABASE_URL ? 'pg' : 'sqlite'),

    // SQLite 专用
    file: process.env.DB_FILE || path.join(ROOT_DIR, 'data', 'course-selection.sqlite'),
    schemaFile: path.join(ROOT_DIR, 'src', 'db', 'schema.sql'),

    // PostgreSQL 专用
    pgSchemaFile: path.join(ROOT_DIR, 'src', 'db', 'schema.pg.sql'),
    pgPoolMax: Number(process.env.PG_POOL_MAX) || 10
  },

  // 节次与时间段的对应关系，用于把「第 N 节」换算成可读时间
  periods: {
    1: { start: '08:00', end: '08:45' },
    2: { start: '08:55', end: '09:40' },
    3: { start: '09:50', end: '10:35' },
    4: { start: '10:45', end: '11:30' },
    5: { start: '11:40', end: '12:25' },
    6: { start: '14:00', end: '14:45' },
    7: { start: '14:55', end: '15:40' },
    8: { start: '15:50', end: '16:35' },
    9: { start: '16:45', end: '17:30' },
    10: { start: '19:00', end: '19:45' },
    11: { start: '19:55', end: '20:40' }
  },

  roles: {
    student: '学生',
    teacher: '教师',
    admin: '管理员'
  },

  weekTypes: {
    all: '每周',
    odd: '单周',
    even: '双周'
  }
};
