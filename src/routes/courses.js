'use strict';

const placeholder = require('./_placeholder');

module.exports = placeholder({
  title: '课程查询',
  roles: ['student', 'teacher', 'admin'],
  endpoints: [
    ['GET', '/courses', '课程列表与检索（按课程名 / 教师 / 院系筛选，展示容量与已选人数）'],
    ['GET', '/courses/:id', '课程详情（上课时间、容量、已选人数、候补人数）']
  ]
});
