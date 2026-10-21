-- ============================================================
--  选课系统 数据库结构（PostgreSQL 版）
--
--  与 schema.sql（SQLite）逐表对应，差异仅三处：
--    1) INTEGER PRIMARY KEY AUTOINCREMENT → INTEGER GENERATED ALWAYS AS IDENTITY
--    2) REAL（学分） → DOUBLE PRECISION
--       不用 NUMERIC：node-postgres 会把 NUMERIC 解析成字符串，
--       而现有代码把 credits 当数字用（求和、格式化），会出错。
--    3) 删除 PRAGMA（PG 强制外键，无此开关）
--
--  ⚠️ 表名 user 是 PostgreSQL 保留字，建表与查询都必须加双引号。
--     建表：本文件用 "user"
--     查询：由 src/db/pg.js 统一改写 FROM/INTO/UPDATE/JOIN user → "user"
--
--  时间戳保持 TEXT（'YYYY-MM-DD HH:MM:SS'），字典序即时间序，
--  排序与区间比较仍然正确。见迁移方案决策 1。
-- ============================================================

-- ---------- 元信息 ----------
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------- 用户（学生 / 教师 / 管理员） ----------
CREATE TABLE IF NOT EXISTS "user" (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE,              -- 学号 / 工号
  password_hash TEXT    NOT NULL,                     -- scrypt 派生密钥（十六进制）
  password_salt TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  department    TEXT,                                 -- 院系
  grade         INTEGER,                              -- 年级（仅学生）
  created_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_role ON "user" (role);

-- ---------- 学期（含选课窗口，B2） ----------
CREATE TABLE IF NOT EXISTS semester (
  id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            TEXT    NOT NULL,
  start_date      TEXT    NOT NULL,
  total_weeks     INTEGER NOT NULL DEFAULT 16,
  select_open_at  TEXT,
  select_close_at TEXT,
  is_current      SMALLINT NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1))
);

-- ---------- 课程（= 某学期的开课班次） ----------
CREATE TABLE IF NOT EXISTS course (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  teacher_id  INTEGER NOT NULL REFERENCES "user" (id),
  semester_id INTEGER NOT NULL REFERENCES semester (id),
  department  TEXT,
  credits     DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  capacity    INTEGER NOT NULL CHECK (capacity >= 0),
  location    TEXT,
  description TEXT,
  status      TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_course_semester ON course (semester_id, status);
CREATE INDEX IF NOT EXISTS idx_course_teacher ON course (teacher_id);
CREATE INDEX IF NOT EXISTS idx_course_name ON course (name);

-- ---------- 上课时间（一门课可有多段；单双周与周次区间在此表达） ----------
CREATE TABLE IF NOT EXISTS class_time (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id    INTEGER NOT NULL REFERENCES course (id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_period INTEGER NOT NULL CHECK (start_period >= 1),
  end_period   INTEGER NOT NULL CHECK (end_period >= 1),
  week_type    TEXT    NOT NULL DEFAULT 'all' CHECK (week_type IN ('all', 'odd', 'even')),
  start_week   INTEGER NOT NULL DEFAULT 1,
  end_week     INTEGER NOT NULL DEFAULT 16,
  CHECK (end_period >= start_period),
  CHECK (end_week >= start_week)
);

CREATE INDEX IF NOT EXISTS idx_class_time_course ON class_time (course_id);
CREATE INDEX IF NOT EXISTS idx_class_time_slot ON class_time (day_of_week, start_period, end_period);

-- ---------- 选课记录（含候补，B4 / R9） ----------
CREATE TABLE IF NOT EXISTS enrollment (
  id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id         INTEGER NOT NULL REFERENCES "user" (id),
  course_id          INTEGER NOT NULL REFERENCES course (id),
  status             TEXT    NOT NULL CHECK (status IN ('enrolled', 'waiting', 'dropped')),
  waitlist_joined_at TEXT,
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL,
  UNIQUE (student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_student ON enrollment (student_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollment_course ON enrollment (course_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollment_waitlist
  ON enrollment (course_id, waitlist_joined_at) WHERE status = 'waiting';

-- ---------- 公告（D5） ----------
CREATE TABLE IF NOT EXISTS announcement (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  author_id  INTEGER NOT NULL REFERENCES "user" (id),
  pinned     SMALLINT NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcement_created ON announcement (created_at DESC);
