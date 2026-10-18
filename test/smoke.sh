#!/usr/bin/env bash
# ============================================================
#  选课系统 · 接口冒烟测试
#
#  前置条件：服务已启动（npm start）
#  用法：npm run smoke
#
#  说明：
#   1. 本机请求必须绕过代理（--noproxy），否则会被本地代理拦截。
#   2. 脚本会**修改选课数据**（选课 / 退课），但结束时会把自己选上的课退掉。
#      建议在 `npm run reset-db` 之后运行以获得确定的结果。
#   3. 并发与边界规则的深度验证见 `npm run stress`。
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

# check_has <描述> <实际文本> <期望包含的子串>
check_has() {
  case "$2" in
    *"$3"*)
      printf '  ✅ %s\n' "$1"
      PASS=$((PASS + 1))
      ;;
    *)
      printf '  ❌ %s（期望包含「%s」，实际「%s」）\n' "$1" "$3" "$2"
      FAIL=$((FAIL + 1))
      ;;
  esac
}

# code <url> [额外 curl 参数...] → 输出 HTTP 状态码
code() {
  local url="$1"; shift
  c -o /dev/null -w '%{http_code}' "$@" "$url"
}

# course_id <会话文件> <关键字> → 输出课程 id
course_id() {
  c -b "$1" "$BASE/courses?keyword=$2" | grep -oE 'href="/courses/[0-9]+"' | head -1 | grep -oE '[0-9]+'
}

# post_flash <会话文件> <路径> <表单体> → 输出重定向后页面上的提示文案
post_flash() {
  local jar="$1" url="$2" body="$3" loc
  loc=$(c -b "$jar" -o /dev/null -w '%{redirect_url}' -d "$body" "$BASE$url")
  if [ -z "$loc" ]; then
    echo ""
    return
  fi
  c -b "$jar" "$loc" | grep -oE 'alert alert-(ok|error)">[^<]*' | head -1 | sed 's/.*">//'
}

# post_error <会话文件> <路径> <表单体> → 输出 400 渲染页面上的错误文案
post_error() {
  c -b "$1" -d "$3" "$BASE$2" | grep -oE 'alert alert-error">[^<]*' | head -1 | sed 's/.*">//'
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
check "课程列表返回 33 门课" "$(grep -c 'strong-link' "$TMP/courses_all.html")" "33"

hit=$(c -b "$STU_JAR" "$BASE/courses?keyword=%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84" | grep -c 'strong-link')
check "按课程名检索「数据结构」命中 1 门" "$hit" "1"

hit=$(c -b "$STU_JAR" "$BASE/courses?keyword=CS10" | grep -c 'strong-link')
check "按课程代码检索 CS10 命中 9 门" "$hit" "9"

hit=$(c -b "$STU_JAR" "$BASE/courses?department=%E6%95%B0%E5%AD%A6%E5%AD%A6%E9%99%A2" | grep -c 'strong-link')
check "按院系筛选「数学学院」命中 8 门" "$hit" "8"

hit=$(c -b "$STU_JAR" "$BASE/courses?dayOfWeek=1" | grep -c 'strong-link')
check "按上课星期筛选「周一」命中 6 门" "$hit" "6"

empty=$(c -b "$STU_JAR" "$BASE/courses?keyword=zzzzz" | grep -c '没有符合条件的课程')
check "无结果时显示空态提示" "$empty" "1"

CID=$(course_id "$STU_JAR" CS102)
check "课程详情可访问" "$(code "$BASE/courses/$CID" -b "$STU_JAR")" "200"
c -b "$STU_JAR" -o "$TMP/course_detail.html" "$BASE/courses/$CID"
check "详情页展示容量信息" "$(grep -c '容量上限' "$TMP/course_detail.html")" "1"

CID_FULL=$(course_id "$STU_JAR" CS111)
full=$(c -b "$STU_JAR" "$BASE/courses/$CID_FULL" | grep -c '名额已满' || true)
check "满员课程显示「名额已满」" "$([ "$full" -ge 1 ] && echo yes || echo no)" "yes"

check "不存在的课程返回 404" "$(code "$BASE/courses/999999" -b "$STU_JAR")" "404"
check "未登录访问课程列表应跳转" "$(code "$BASE/courses")" "302"

echo
echo "========== 3. 选课与退课（F2 F3 F4 B4）=========="

check "学生可访问我的选课" "$(code "$BASE/enrollments/my" -b "$STU_JAR")" "200"
check "教师访问我的选课应 403" "$(code "$BASE/enrollments/my" -b "$TEA_JAR")" "403"
check "未登录提交选课应跳转" "$(code "$BASE/enrollments" -d 'courseId=1')" "302"

# CS103 计算机组成原理：周三 1-2 节，与陈思远已选课程不冲突，容量充足
CID_OK=$(course_id "$STU_JAR" CS103)
msg=$(post_flash "$STU_JAR" /enrollments "courseId=$CID_OK&back=/courses")
check_has "选课成功" "$msg" "选课成功"

msg=$(post_flash "$STU_JAR" /enrollments "courseId=$CID_OK&back=/courses")
check_has "重复选课被拒绝" "$msg" "你已经选中了"

# MA101 高等数学 A：周一 1-2 节，与已选的 CS101 完全重叠
CID_CONFLICT=$(course_id "$STU_JAR" MA101)
msg=$(post_flash "$STU_JAR" /enrollments "courseId=$CID_CONFLICT&back=/courses")
check_has "时间冲突被拒绝" "$msg" "时间冲突"

# CS111：容量 2 且候补队列也已满（种子数据）
msg=$(post_flash "$STU_JAR" /enrollments "courseId=$CID_FULL&back=/courses")
check_has "候补队列已满被拒绝" "$msg" "候补队列也已满"

mine=$(c -b "$STU_JAR" "$BASE/enrollments/my")
check_has "我的选课中出现刚选的课程" "$mine" "计算机组成原理"

msg=$(post_flash "$STU_JAR" "/enrollments/$CID_OK/drop" "back=/enrollments/my")
check_has "退课成功" "$msg" "已退选"

mine_after=$(c -b "$STU_JAR" "$BASE/enrollments/my" | grep -c '计算机组成原理')
check "退课后该课程已从我的选课中移除" "$mine_after" "0"

msg=$(post_flash "$STU_JAR" "/enrollments/$CID_CONFLICT/drop" "back=/enrollments/my")
check_has "退未选中的课程被拒绝" "$msg" "尚未选中"

echo
echo "========== 4. 公告通知（D5）=========="

c -b "$STU_JAR" -o "$TMP/announce.html" "$BASE/announcements"
check "公告列表可访问" "$?" "0"
check "公告列表返回 3 条" "$(grep -c 'announce-meta' "$TMP/announce.html")" "3"
check "存在置顶公告标记" "$(grep -c 'tag-pin' "$TMP/announce.html")" "1"

AID=$(grep -oE 'href="/announcements/[0-9]+"' "$TMP/announce.html" | head -1 | grep -oE '[0-9]+')
check "公告详情可访问" "$(code "$BASE/announcements/$AID" -b "$STU_JAR")" "200"
c -b "$STU_JAR" -o "$TMP/announce_detail.html" "$BASE/announcements/$AID"
check "公告详情含正文" "$(grep -c 'article-body' "$TMP/announce_detail.html")" "1"

check "不存在的公告返回 404" "$(code "$BASE/announcements/999999" -b "$STU_JAR")" "404"
check "未登录访问公告应跳转" "$(code "$BASE/announcements")" "302"
check "教师也可查看公告" "$(code "$BASE/announcements" -b "$TEA_JAR")" "200"

echo
echo "========== 5. 管理后台（R8）=========="

check "学生访问管理后台应 403" "$(code "$BASE/admin" -b "$STU_JAR")" "403"
check "管理后台概览可访问" "$(code "$BASE/admin" -b "$ADMIN_JAR")" "200"
check "课程管理页可访问" "$(code "$BASE/admin/courses" -b "$ADMIN_JAR")" "200"
check "新增课程页可访问" "$(code "$BASE/admin/courses/new" -b "$ADMIN_JAR")" "200"
check "选课统计页可访问" "$(code "$BASE/admin/enrollments" -b "$ADMIN_JAR")" "200"

# --- 新增课程 ---
msg=$(post_flash "$ADMIN_JAR" /admin/courses \
  "code=TST901&name=%E6%B5%8B%E8%AF%95%E8%AF%BE%E7%A8%8B&teacherId=2&department=%E8%AE%A1%E7%AE%97%E6%9C%BA%E5%AD%A6%E9%99%A2&credits=2&capacity=10&location=A101&description=&status=open")
check_has "新增课程成功" "$msg" "已创建"

NEW_CID=$(c -b "$ADMIN_JAR" "$BASE/admin/courses" | grep -oE 'href="/admin/courses/[0-9]+/edit"' | head -1 | grep -oE '[0-9]+')
# 用课程代码定位刚建的课程 id（按 code 排序，TST901 排在最后）
NEW_CID=$(c -b "$ADMIN_JAR" "$BASE/courses?keyword=TST901" | grep -oE 'href="/courses/[0-9]+"' | head -1 | grep -oE '[0-9]+')
check "新增课程可在课程查询中检索到" "$([ -n "$NEW_CID" ] && echo yes || echo no)" "yes"

# --- 重复课程代码应被拒绝 ---
msg=$(post_error "$ADMIN_JAR" /admin/courses \
  "code=TST901&name=%E9%87%8D%E5%A4%8D%E4%BB%A3%E7%A0%81&teacherId=2&credits=2&capacity=10&status=open")
check_has "重复课程代码被拒绝" "$msg" "已被占用"

# --- 编辑容量 ---
msg=$(post_flash "$ADMIN_JAR" "/admin/courses/$NEW_CID" \
  "code=TST901&name=%E6%B5%8B%E8%AF%95%E8%AF%BE%E7%A8%8B&teacherId=2&department=%E8%AE%A1%E7%AE%97%E6%9C%BA%E5%AD%A6%E9%99%A2&credits=2&capacity=5&location=A101&status=open")
check_has "编辑课程成功" "$msg" "已更新"
cap=$(c -b "$ADMIN_JAR" "$BASE/courses/$NEW_CID" | grep -oE '容量上限</dt><dd>[0-9]+' | grep -oE '[0-9]+$')
check "容量已改为 5" "$cap" "5"

# --- 删除课程 ---
msg=$(post_flash "$ADMIN_JAR" "/admin/courses/$NEW_CID/delete" "")
check_has "删除课程成功" "$msg" "已删除"
left=$(c -b "$ADMIN_JAR" "$BASE/courses?keyword=TST901" | grep -c 'strong-link')
check "删除后检索不到该课程" "$left" "0"

# --- 有选课记录的课程不允许删除（CS101 有预置选课）---
CS101_ID=$(course_id "$ADMIN_JAR" CS101)
msg=$(post_flash "$ADMIN_JAR" "/admin/courses/$CS101_ID/delete" "")
check_has "有选课记录的课程禁止删除" "$msg" "不能删除"

# --- 选课窗口：非法区间被拒绝，合法保存后还原 ---
sem_page=$(c -b "$ADMIN_JAR" "$BASE/admin/semester")
orig_open=$(echo "$sem_page" | grep -oE 'name="openAt" value="[^"]*"' | sed 's/.*value="//; s/"$//')
orig_close=$(echo "$sem_page" | grep -oE 'name="closeAt" value="[^"]*"' | sed 's/.*value="//; s/"$//')
check "选课窗口页可访问" "$(code "$BASE/admin/semester" -b "$ADMIN_JAR")" "200"
check "截止早于开放应被拒绝" \
  "$(code "$BASE/admin/semester" -b "$ADMIN_JAR" -d 'openAt=2026-12-01T08:00&closeAt=2026-11-01T08:00')" "400"
msg=$(post_flash "$ADMIN_JAR" /admin/semester "openAt=2026-09-01T08:00&closeAt=2026-12-31T23:59")
check_has "合法窗口保存成功" "$msg" "选课窗口已保存"

# 还原为测试前的窗口，避免污染数据
if [ -n "$orig_open" ] && [ -n "$orig_close" ]; then
  post_flash "$ADMIN_JAR" /admin/semester "openAt=$orig_open&closeAt=$orig_close" > /dev/null
fi

# --- 公告发布 / 置顶 / 删除 ---
msg=$(post_flash "$ADMIN_JAR" /admin/announcements "title=%E6%B5%8B%E8%AF%95%E5%85%AC%E5%91%8A&content=%E6%B5%8B%E8%AF%95%E5%86%85%E5%AE%B9&pinned=on")
check_has "发布公告成功" "$msg" "已发布"
list_html=$(c -b "$ADMIN_JAR" "$BASE/announcements")
check_has "公告列表出现新公告" "$list_html" "测试公告"

AID2=$(c -b "$ADMIN_JAR" "$BASE/admin/announcements" | grep -oE 'announcements/[0-9]+/delete' | grep -oE '[0-9]+' | sort -n | tail -1)
check_has "取消置顶成功" "$(post_flash "$ADMIN_JAR" "/admin/announcements/$AID2/pin" "")" "取消置顶"
check_has "删除公告成功" "$(post_flash "$ADMIN_JAR" "/admin/announcements/$AID2/delete" "")" "已删除"

check "教师访问管理后台应 403" "$(code "$BASE/admin/courses" -b "$TEA_JAR")" "403"

echo
echo "========== 6. 教师端（R7）=========="

check "学生访问教师端应 403" "$(code "$BASE/teacher" -b "$STU_JAR")" "403"
check "教师端首页可访问" "$(code "$BASE/teacher" -b "$TEA_JAR")" "200"

c -b "$TEA_JAR" -o "$TMP/tea_home.html" "$BASE/teacher"
# 张伟名下 5 门课：CS101 / CS104 / CS107 / CS110 / CS113，其中 CS101 与 CS113 时间冲突
check "教师首页提示授课冲突" "$(grep -c '处授课时间冲突' "$TMP/tea_home.html")" "1"

c -b "$TEA_JAR" -o "$TMP/tea_courses.html" "$BASE/teacher/courses"
check "我的课程页可访问" "$?" "0"
# 用不重复的课程 id 数量判断，避免页面上重复的链接干扰计数
check "我的课程列出 5 门" \
  "$(grep -oE 'teacher/courses/[0-9]+/students' "$TMP/tea_courses.html" | sort -u | wc -l | tr -d ' ')" "5"

# 自己课程（CS101）的选课名单
CS101_T=$(course_id "$TEA_JAR" CS101)
check "自己课程的选课名单可访问" "$(code "$BASE/teacher/courses/$CS101_T/students" -b "$TEA_JAR")" "200"
c -b "$TEA_JAR" -o "$TMP/tea_students.html" "$BASE/teacher/courses/$CS101_T/students"
check "名单中出现已选学生" "$(grep -c '陈思远' "$TMP/tea_students.html")" "1"

# 越权：张伟访问李娜的课程（CS102）名单
CS102_T=$(course_id "$TEA_JAR" CS102)
check "访问他人课程名单应 403" "$(code "$BASE/teacher/courses/$CS102_T/students" -b "$TEA_JAR")" "403"
check "访问不存在的课程名单应 404" "$(code "$BASE/teacher/courses/999999/students" -b "$TEA_JAR")" "404"

# 授课冲突提示：张伟的 CS101 与 CS113 都在周一 1-2 节
conf_page=$(c -b "$TEA_JAR" "$BASE/teacher/conflicts")
check_has "冲突页检出 CS101 与 CS113 冲突" "$conf_page" "计算机图形学"
check_has "冲突页展示具体时段" "$conf_page" "周一 第1-2节"

echo
echo "========== 7. 权限隔离 =========="

check "学生访问教师端应 403" "$(code "$BASE/teacher" -b "$STU_JAR")" "403"
check "教师访问管理后台应 403" "$(code "$BASE/admin" -b "$TEA_JAR")" "403"
check "教师端可访问" "$(code "$BASE/teacher" -b "$TEA_JAR")" "200"
check "管理后台可访问" "$(code "$BASE/admin" -b "$ADMIN_JAR")" "200"

echo
echo "========== 8. 错误处理与登出 =========="

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
