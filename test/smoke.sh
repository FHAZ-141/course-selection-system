#!/usr/bin/env bash
# ============================================================
#  选课系统 · 接口冒烟测试
#
#  前置条件：服务已启动（npm start）
#  用法：npm run smoke
#
#  说明：本机请求必须绕过代理（--noproxy），否则会被本地代理拦截。
# ============================================================
set -u

BASE="${BASE:-http://127.0.0.1:3000}"
TMP="${TMPDIR:-/tmp}/cs-smoke"
mkdir -p "$TMP"

ADMIN_JAR="$TMP/admin.txt"
STU_JAR="$TMP/student.txt"
TEA_JAR="$TMP/teacher.txt"

PASS=0
FAIL=0

c() { curl -sS --noproxy '*' -m 25 "$@"; }

# check <描述> <实际值> <期望值>
check() {
  if [ "$2" = "$3" ]; then
    printf '  ✅ %s\n' "$1"
    PASS=$((PASS + 1))
  else
    printf '  ❌ %s（期望 %s，实际 %s）\n' "$1" "$3" "$2"
    FAIL=$((FAIL + 1))
  fi
}

# code <url> [额外 curl 参数...] → 输出 HTTP 状态码
code() {
  local url="$1"; shift
  c -o /dev/null -w '%{http_code}' "$@" "$url"
}

echo "========== 1. 基础与鉴权 =========="

health=$(c "$BASE/health" | grep -o '"ok":true' || true)
check "健康检查返回 ok" "$health" '"ok":true'

check "未登录访问首页应跳转" "$(code "$BASE/")" "302"
check "登录页可访问" "$(code "$BASE/login")" "200"
check "错误密码应被拒绝" "$(code "$BASE/login" -d 'username=admin&password=wrong')" "401"

check "管理员登录" "$(code "$BASE/login" -c "$ADMIN_JAR" -d 'username=admin&password=123456')" "302"
check "管理员首页可访问" "$(code "$BASE/" -b "$ADMIN_JAR")" "200"

check "学生登录" "$(code "$BASE/login" -c "$STU_JAR" -d 'username=2024010101&password=123456')" "302"
check "教师登录" "$(code "$BASE/login" -c "$TEA_JAR" -d 'username=T1001&password=123456')" "302"

echo
echo "========== 2. 课程查询（F1）=========="

c -b "$STU_JAR" -o "$TMP/courses_all.html" "$BASE/courses"
check "课程列表可访问" "$?" "0"
total=$(grep -c 'strong-link' "$TMP/courses_all.html")
check "课程列表返回 32 门课" "$total" "32"

hit=$(c -b "$STU_JAR" "$BASE/courses?keyword=%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84" | grep -c 'strong-link')
check "按课程名检索「数据结构」命中 1 门" "$hit" "1"

hit=$(c -b "$STU_JAR" "$BASE/courses?keyword=CS10" | grep -c 'strong-link')
check "按课程代码检索 CS10 命中 9 门" "$hit" "9"

hit=$(c -b "$STU_JAR" "$BASE/courses?department=%E6%95%B0%E5%AD%A6%E5%AD%A6%E9%99%A2" | grep -c 'strong-link')
check "按院系筛选「数学学院」命中 8 门" "$hit" "8"

hit=$(c -b "$STU_JAR" "$BASE/courses?dayOfWeek=1" | grep -c 'strong-link')
check "按上课星期筛选「周一」命中 5 门" "$hit" "5"

empty=$(c -b "$STU_JAR" "$BASE/courses?keyword=zzzzz" | grep -c '没有符合条件的课程')
check "无结果时显示空态提示" "$empty" "1"

# 取 CS102 的课程 id
CID=$(c -b "$STU_JAR" "$BASE/courses?keyword=CS102" | grep -oE 'href="/courses/[0-9]+"' | head -1 | grep -oE '[0-9]+')
check "课程详情可访问" "$(code "$BASE/courses/$CID" -b "$STU_JAR")" "200"
c -b "$STU_JAR" -o "$TMP/course_detail.html" "$BASE/courses/$CID"
found=$(grep -c '容量上限' "$TMP/course_detail.html")
check "详情页展示容量信息" "$found" "1"

# CS111 容量 2，种子数据已塞满
CID_FULL=$(c -b "$STU_JAR" "$BASE/courses?keyword=CS111" | grep -oE 'href="/courses/[0-9]+"' | head -1 | grep -oE '[0-9]+')
full=$(c -b "$STU_JAR" "$BASE/courses/$CID_FULL" | grep -c '名额已满' || true)
check "满员课程显示「名额已满」" "$([ "$full" -ge 1 ] && echo yes || echo no)" "yes"

check "不存在的课程返回 404" "$(code "$BASE/courses/999999" -b "$STU_JAR")" "404"
check "未登录访问课程列表应跳转" "$(code "$BASE/courses")" "302"

echo
echo "========== 3. 权限隔离 =========="

check "学生访问教师端应 403" "$(code "$BASE/teacher" -b "$STU_JAR")" "403"
check "教师访问管理后台应 403" "$(code "$BASE/admin" -b "$TEA_JAR")" "403"
check "教师端可访问" "$(code "$BASE/teacher" -b "$TEA_JAR")" "200"
check "管理后台可访问" "$(code "$BASE/admin" -b "$ADMIN_JAR")" "200"

echo
echo "========== 4. 错误处理与登出 =========="

check "不存在的路径返回 404" "$(code "$BASE/no-such-page" -b "$ADMIN_JAR")" "404"
check "登出" "$(code "$BASE/logout" -b "$ADMIN_JAR" -X POST)" "302"
check "登出后访问首页应跳转" "$(code "$BASE/" -b "$ADMIN_JAR")" "302"

echo
echo "=========================================="
printf '  通过 %d 项' "$PASS"
if [ "$FAIL" -gt 0 ]; then
  printf '，失败 %d 项\n' "$FAIL"
  echo "=========================================="
  exit 1
fi
printf '，全部通过\n'
echo "=========================================="
