'use strict';

const express = require('express');
const db = require('../db');
const windowService = require('../services/windowService');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

async function buildStats(user) {
  if (!user) return null;

  if (user.role === 'student') {
    const enrolled = await db.get(
      `SELECT COUNT(*) AS courses, COALESCE(SUM(c.credits), 0) AS credits
         FROM enrollment e JOIN course c ON c.id = e.course_id
        WHERE e.student_id = ? AND e.status = 'enrolled'`,
      user.id
    );
    const waiting = await db.get(
      "SELECT COUNT(*) AS c FROM enrollment WHERE student_id = ? AND status = 'waiting'",
      user.id
    );
    return [
      { label: '已选课程', value: `${enrolled.courses} 门` },
      { label: '已选学分', value: `${Number(enrolled.credits).toFixed(1)} 学分` },
      { label: '候补中', value: `${waiting.c} 门` }
    ];
  }

  if (user.role === 'teacher') {
    const courses = await db.get('SELECT COUNT(*) AS c FROM course WHERE teacher_id = ?', user.id);
    const students = await db.get(
      `SELECT COUNT(*) AS c FROM enrollment e JOIN course c ON c.id = e.course_id
        WHERE c.teacher_id = ? AND e.status = 'enrolled'`,
      user.id
    );
    return [
      { label: '所授课程', value: `${courses.c} 门` },
      { label: '选课学生', value: `${students.c} 人次` }
    ];
  }

  const courses = await db.get("SELECT COUNT(*) AS c FROM course WHERE status = 'open'");
  const students = await db.get("SELECT COUNT(*) AS c FROM user WHERE role = 'student'");
  const enrolled = await db.get("SELECT COUNT(*) AS c FROM enrollment WHERE status = 'enrolled'");
  return [
    { label: '开设课程', value: `${courses.c} 门` },
    { label: '在册学生', value: `${students.c} 人` },
    { label: '选课记录', value: `${enrolled.c} 条` }
  ];
}

router.get('/', requireLogin, async (req, res) => {
  const semester = await windowService.getCurrentSemester();
  const announcements = await db.all(
    `SELECT a.*, u.name AS author_name
       FROM announcement a JOIN user u ON u.id = a.author_id
      ORDER BY a.pinned DESC, a.created_at DESC
      LIMIT 5`
  );

  res.render('home', {
    title: '首页',
    semester,
    announcements,
    windowState: await windowService.getWindowState(semester),
    stats: await buildStats(req.user)
  });
});

module.exports = router;
