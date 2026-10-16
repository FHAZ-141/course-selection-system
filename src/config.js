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
    file: process.env.DB_FILE || path.join(ROOT_DIR, 'data', 'course-selection.sqlite'),
    schemaFile: path.join(ROOT_DIR, 'src', 'db', 'schema.sql')
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
