#!/usr/bin/env bash
# v0.1.0 骨架端到端验证（本地请求需绕过代理）
set -u
BASE="http://127.0.0.1:3000"
TMP="C:/Users/19522/AppData/Local/Temp"
JAR="$TMP/cs-cookie.txt"
rm -f "$JAR"

c() { curl -sS --noproxy '*' -m 25 "$@"; }

echo "=== 1) 健康检查 ==="
c "$BASE/health"; echo

echo "=== 2) 未登录访问首页（期望 302 -> /login）==="
c -o /dev/null -w "HTTP %{http_code} -> %{redirect_url}\n" "$BASE/"

echo "=== 3) 登录页可访问 ==="
c -o /dev/null -w "HTTP %{http_code}\n" "$BASE/login"

echo "=== 4) 错误密码（期望 401）==="
c -o /dev/null -w "HTTP %{http_code}\n" -d "username=admin&password=wrong" "$BASE/login"

echo "=== 5) 管理员登录（期望 302 -> /）==="
c -c "$JAR" -o /dev/null -w "HTTP %{http_code} -> %{redirect_url}\n" \
  -d "username=admin&password=123456" "$BASE/login"

echo "=== 6) 管理员首页 ==="
c -b "$JAR" -o "$TMP/cs-home.html" -w "HTTP %{http_code}\n" "$BASE/"
grep -oE '你好，[^<]*|选课开放中|选课已截止|开设课程|在册学生|选课记录|最新公告|系统管理员' "$TMP/cs-home.html" | sort -u

echo "=== 7) 学生登录并查看首页 ==="
c -c "$TMP/cs-stu.txt" -o /dev/null -w "学生登录 HTTP %{http_code}\n" \
  -d "username=2024010101&password=123456" "$BASE/login"
c -b "$TMP/cs-stu.txt" -o "$TMP/cs-stu-home.html" -w "学生首页 HTTP %{http_code}\n" "$BASE/"
grep -oE '你好，[^<]*|已选课程|已选学分|候补中|选课开放中' "$TMP/cs-stu-home.html" | sort -u
echo "--- 统计卡片数值 ---"
grep -A1 'stat-label' "$TMP/cs-stu-home.html" | grep 'stat-value' | sed 's/<[^>]*>//g' | sed 's/^ *//'

echo "=== 8) 学生访问课程查询（占位页）==="
c -b "$TMP/cs-stu.txt" -o "$TMP/cs-courses.html" -w "HTTP %{http_code}\n" "$BASE/courses"
grep -oE '课程查询|计划实现的接口|/courses/:id' "$TMP/cs-courses.html" | sort -u

echo "=== 9) 教师端越权：学生访问 /teacher（期望 403）==="
c -b "$TMP/cs-stu.txt" -o /dev/null -w "HTTP %{http_code}\n" "$BASE/teacher"

echo "=== 10) 教师登录并访问教师端 ==="
c -c "$TMP/cs-tea.txt" -o /dev/null -w "教师登录 HTTP %{http_code}\n" \
  -d "username=T1001&password=123456" "$BASE/login"
c -b "$TMP/cs-tea.txt" -o "$TMP/cs-teacher.html" -w "教师端 HTTP %{http_code}\n" "$BASE/teacher"
grep -oE '教师端|/teacher/courses|/teacher/conflicts' "$TMP/cs-teacher.html" | sort -u

echo "=== 11) 404 ==="
c -b "$JAR" -o /dev/null -w "HTTP %{http_code}\n" "$BASE/nope"

echo "=== 12) 退出登录 ==="
c -b "$JAR" -o /dev/null -w "HTTP %{http_code} -> %{redirect_url}\n" -X POST "$BASE/logout"
c -b "$JAR" -o /dev/null -w "退出后访问首页 HTTP %{http_code}\n" "$BASE/"
