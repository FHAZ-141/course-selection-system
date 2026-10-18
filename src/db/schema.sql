-- ============================================================
--  选课系统 数据库结构
--  依据：docs/00-需求确认清单.md
--  · C1 时间粒度：星期 + 节次
--  · C2 支持单双周（week_type + start_week/end_week）
--  · B4 候补队列（enrollment.status = waiting，按 waitlist_joined_at FIFO）
--  · D5 公告通知
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- 元信息 ----------
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------- 用户（学生 / 教师 / 管理员） ----------
CREATE TABLE IF NOT EXISTS user (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,              -- 学号 / 工号
  password_hash TEXT    NOT NULL,                     -- scrypt 派生密钥（十六进制）
  password_salt TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  department    TEXT,                                 -- 院系
  grade         INTEGER,                              -- 年级（仅学生）
  created_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_role ON user (role);

-- ---------- 学期（含选课窗口，B2） ----------
CREATE TABLE IF NOT EXISTS semester (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,                   -- 如 2026-2027 学年第一学期
  start_date      TEXT    NOT NULL,                   -- 学期第一天（用于周次换算）
  total_weeks     INTEGER NOT NULL DEFAULT 16,
  select_open_at  TEXT,                               -- 选课窗口开放时间
  select_close_at TEXT,                               -- 选课窗口截止时间
  is_current      INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1))
);

-- ---------- 课程（= 某学期的开课班次） ----------
CREATE TABLE IF NOT EXISTS course (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,                -- 课程代码
  name        TEXT    NOT NULL,
  teacher_id  INTEGER NOT NULL REFERENCES user (id),
  semester_id INTEGER NOT NULL REFERENCES semester (id),
  department  TEXT,
  credits     REAL    NOT NULL DEFAULT 2.0,
  capacity    INTEGER NOT NULL CHECK (capacity >= 0), -- 容量上限（§2.1-4 人数限制）
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
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id    INTEGER NOT NULL REFERENCES course (id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),  -- 1=周一 … 7=周日
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
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id          INTEGER NOT NULL REFERENCES user (id),
  course_id           INTEGER NOT NULL REFERENCES course (id),
  status              TEXT    NOT NULL CHECK (status IN ('enrolled', 'waiting', 'dropped')),
  waitlist_joined_at  TEXT,                           -- 进入候补的时间，候补按此 FIFO
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL,
  UNIQUE (student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_student ON enrollment (student_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollment_course ON enrollment (course_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollment_waitlist
  ON enrollment (course_id, waitlist_joined_at) WHERE status = 'waiting';

-- ---------- 公告（D5） ----------
CREATE TABLE IF NOT EXISTS announcement (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  author_id  INTEGER NOT NULL REFERENCES user (id),
  pinned     INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcement_created ON announcement (created_at DESC);
