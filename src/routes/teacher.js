'use strict';

const placeholder = require('./_placeholder');

module.exports = placeholder({
  title: '教师端',
  roles: ['teacher'],
  endpoints: [
    ['GET', '/teacher', '教师端首页'],
    ['GET', '/teacher/courses', '我所授课程列表'],
    ['GET', '/teacher/courses/:id/students', '课程选课名单与人数'],
    ['GET', '/teacher/conflicts', '授课时间冲突提示（我讲授的课程之间是否撞车）']
  ]
});
