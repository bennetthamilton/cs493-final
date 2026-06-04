#!/usr/bin/env bash

# =====================================================================
# CS493 Final Project Demo Test Script
# =====================================================================
# Assumptions:
#   docker compose down -v
#   docker compose up --build
#
# Only seeded user:
#   admin@example.com / adminpassword
#
# Run:
#   chmod +x demo_runtests.sh
#   STEP_THROUGH=1 ./demo_runtests.sh
#
#   OR (without stepping):
#   ./demo_runtests.sh
# =====================================================================

set -u

BASE_URL="${BASE_URL:-http://localhost:8000}"
STEP_THROUGH="${STEP_THROUGH:-0}"

ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="adminpassword"

RUN_ID="$(date +%s)"

INSTRUCTOR_EMAIL="demo.instructor.${RUN_ID}@example.com"
STUDENT_EMAIL="demo.student.${RUN_ID}@example.com"

INSTRUCTOR_PASSWORD="instructorpassword"
STUDENT_PASSWORD="studentpassword"

TEST_FILE="demo-submission-${RUN_ID}.txt"

BODY_FILE="/tmp/cs493_demo_body_${RUN_ID}.json"

ADMIN_TOKEN=""
INSTRUCTOR_TOKEN=""
STUDENT_TOKEN=""

ADMIN_ID=""
INSTRUCTOR_ID=""
STUDENT_ID=""

COURSE_ID=""
ASSIGNMENT_ID=""

section() {
  echo
  echo "====================================================================="
  echo "$1"
  echo "====================================================================="
  echo
}

explain() {
  echo ">>> $1"
  echo
}

pause_if_needed() {
  if [ "$STEP_THROUGH" = "1" ]; then
    echo
    read -r -p "Press Enter to continue..."
    echo
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: Required command '$1' is not installed."
    exit 1
  fi
}

show_response() {
  local status="$1"

  if [ -s "$BODY_FILE" ]; then
    if jq . "$BODY_FILE" >/dev/null 2>&1; then
      jq . "$BODY_FILE"
    else
      cat "$BODY_FILE"
      echo
    fi
  else
    echo "(empty response body)"
  fi

  echo
  echo "HTTP status: $status"
  echo
}

expect_status() {
  local actual="$1"
  local expected="$2"

  if [ "$expected" != "ANY" ] && [ "$actual" != "$expected" ]; then
    echo "WARNING: Expected HTTP $expected but got HTTP $actual."
    echo
  fi
}

cleanup() {
  rm -f "$TEST_FILE" "$BODY_FILE"
}

trap cleanup EXIT

# ---------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------

section "Pre-flight checks"

require_command curl
require_command jq

cat > "$TEST_FILE" <<EOF
This is a demo submission file for the CS493 final project.
Created by demo_runtests.sh with run id ${RUN_ID}.
EOF

echo "Base URL: $BASE_URL"
echo "Admin email: $ADMIN_EMAIL"
echo "Generated instructor email: $INSTRUCTOR_EMAIL"
echo "Generated student email: $STUDENT_EMAIL"
echo "Created test upload file: $TEST_FILE"

pause_if_needed

# ---------------------------------------------------------------------
# Admin login
# ---------------------------------------------------------------------

section "Login as seeded admin"

explain "This logs in as the only user seeded by init.sql after docker compose down -v."

ADMIN_LOGIN_BODY=$(jq -n \
  --arg email "$ADMIN_EMAIL" \
  --arg password "$ADMIN_PASSWORD" \
  '{email: $email, password: $password}')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/users/login" \
  -H "Content-Type: application/json" \
  -d "$ADMIN_LOGIN_BODY")

show_response "$STATUS"
expect_status "$STATUS" "200"

ADMIN_TOKEN=$(jq -r '.token // empty' "$BODY_FILE")

if [ -z "$ADMIN_TOKEN" ]; then
  echo "ERROR: Could not extract admin token."
  exit 1
fi

ADMIN_ID=$(jq -r '.id // .userId // .user_id // empty' "$BODY_FILE")

if [ -z "$ADMIN_ID" ]; then
  ADMIN_ID=$(
    echo "$ADMIN_TOKEN" \
      | awk -F. '{print $2}' \
      | base64 -d 2>/dev/null \
      | jq -r '.id // .userId // .user_id // .sub // empty' 2>/dev/null || true
  )
fi

echo "Saved admin token."
echo "Detected admin ID: ${ADMIN_ID:-unknown}"

pause_if_needed

# ---------------------------------------------------------------------
# Create instructor and student users
# ---------------------------------------------------------------------

section "Admin creates instructor and student users"

explain "This creates a fresh instructor user for the demo."

CREATE_INSTRUCTOR_BODY=$(jq -n \
  --arg name "Demo Instructor" \
  --arg email "$INSTRUCTOR_EMAIL" \
  --arg password "$INSTRUCTOR_PASSWORD" \
  --arg role "instructor" \
  '{name: $name, email: $email, password: $password, role: $role}')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CREATE_INSTRUCTOR_BODY")

show_response "$STATUS"
expect_status "$STATUS" "201"

INSTRUCTOR_ID=$(jq -r '.id // .userId // .user_id // empty' "$BODY_FILE")

if [ -z "$INSTRUCTOR_ID" ]; then
  echo "ERROR: Could not extract instructor ID."
  exit 1
fi

echo "Saved instructor ID: $INSTRUCTOR_ID"

pause_if_needed

explain "This creates a fresh student user for the demo."

CREATE_STUDENT_BODY=$(jq -n \
  --arg name "Demo Student" \
  --arg email "$STUDENT_EMAIL" \
  --arg password "$STUDENT_PASSWORD" \
  --arg role "student" \
  '{name: $name, email: $email, password: $password, role: $role}')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CREATE_STUDENT_BODY")

show_response "$STATUS"
expect_status "$STATUS" "201"

STUDENT_ID=$(jq -r '.id // .userId // .user_id // empty' "$BODY_FILE")

if [ -z "$STUDENT_ID" ]; then
  echo "ERROR: Could not extract student ID."
  exit 1
fi

echo "Saved student ID: $STUDENT_ID"

pause_if_needed

# ---------------------------------------------------------------------
# Login as instructor and student
# ---------------------------------------------------------------------

section "Login as instructor and student"

explain "This logs in as the newly created instructor."

INSTRUCTOR_LOGIN_BODY=$(jq -n \
  --arg email "$INSTRUCTOR_EMAIL" \
  --arg password "$INSTRUCTOR_PASSWORD" \
  '{email: $email, password: $password}')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/users/login" \
  -H "Content-Type: application/json" \
  -d "$INSTRUCTOR_LOGIN_BODY")

show_response "$STATUS"
expect_status "$STATUS" "200"

INSTRUCTOR_TOKEN=$(jq -r '.token // empty' "$BODY_FILE")

if [ -z "$INSTRUCTOR_TOKEN" ]; then
  echo "ERROR: Could not extract instructor token."
  exit 1
fi

echo "Saved instructor token."

pause_if_needed

explain "This logs in as the newly created student."

STUDENT_LOGIN_BODY=$(jq -n \
  --arg email "$STUDENT_EMAIL" \
  --arg password "$STUDENT_PASSWORD" \
  '{email: $email, password: $password}')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/users/login" \
  -H "Content-Type: application/json" \
  -d "$STUDENT_LOGIN_BODY")

show_response "$STATUS"
expect_status "$STATUS" "200"

STUDENT_TOKEN=$(jq -r '.token // empty' "$BODY_FILE")

if [ -z "$STUDENT_TOKEN" ]; then
  echo "ERROR: Could not extract student token."
  exit 1
fi

echo "Saved student token."

pause_if_needed

# ---------------------------------------------------------------------
# User authorization
# ---------------------------------------------------------------------

section "User profile access and authorization"

if [ -n "$ADMIN_ID" ]; then
  explain "This shows the admin can view their own user record."

  STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
    -X GET "$BASE_URL/users/$ADMIN_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

  show_response "$STATUS"
  expect_status "$STATUS" "200"

  pause_if_needed
fi

explain "This shows the instructor can view their own user record."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X GET "$BASE_URL/users/$INSTRUCTOR_ID" \
  -H "Authorization: Bearer $INSTRUCTOR_TOKEN")

show_response "$STATUS"
expect_status "$STATUS" "200"

pause_if_needed

explain "This shows authorization protection: the student tries to view the instructor's user record."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X GET "$BASE_URL/users/$INSTRUCTOR_ID" \
  -H "Authorization: Bearer $STUDENT_TOKEN")

show_response "$STATUS"
expect_status "$STATUS" "403"

pause_if_needed

# ---------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------

section "Course creation, retrieval, update, and authorization"

explain "This creates a course as admin and assigns the demo instructor."

CREATE_COURSE_BODY=$(jq -n \
  --arg subject "CS" \
  --arg number "493" \
  --arg title "Cloud Application Development Demo" \
  --arg term "sp26" \
  --argjson instructorId "$INSTRUCTOR_ID" \
  '{
    subject: $subject,
    number: $number,
    title: $title,
    term: $term,
    instructorId: $instructorId
  }')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/courses" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CREATE_COURSE_BODY")

show_response "$STATUS"
expect_status "$STATUS" "201"

COURSE_ID=$(jq -r '.id // .courseId // .course_id // empty' "$BODY_FILE")

if [ -z "$COURSE_ID" ]; then
  echo "ERROR: Could not extract course ID."
  exit 1
fi

echo "Saved course ID: $COURSE_ID"

pause_if_needed

explain "This retrieves the newly created course."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X GET "$BASE_URL/courses/$COURSE_ID")

show_response "$STATUS"
expect_status "$STATUS" "200"

pause_if_needed

explain "This updates the course title as admin."

UPDATE_COURSE_BODY=$(jq -n \
  --arg title "Updated Cloud Application Development Demo" \
  '{title: $title}')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X PATCH "$BASE_URL/courses/$COURSE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$UPDATE_COURSE_BODY")

show_response "$STATUS"
expect_status "$STATUS" "204"

pause_if_needed

explain "This demonstrates authorization: instructor attempts to create a course and should be rejected."

UNAUTHORIZED_COURSE_BODY=$(jq -n \
  --arg subject "CS" \
  --arg number "999" \
  --arg title "Unauthorized Instructor Course" \
  --arg term "sp26" \
  --argjson instructorId "$INSTRUCTOR_ID" \
  '{
    subject: $subject,
    number: $number,
    title: $title,
    term: $term,
    instructorId: $instructorId
  }')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/courses" \
  -H "Authorization: Bearer $INSTRUCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$UNAUTHORIZED_COURSE_BODY")

show_response "$STATUS"
expect_status "$STATUS" "403"

pause_if_needed

# ---------------------------------------------------------------------
# Enrollment
# ---------------------------------------------------------------------

section "Course enrollment and roster access"

explain "This enrolls the demo student in the course."

ENROLL_BODY=$(jq -n \
  --argjson studentId "$STUDENT_ID" \
  '{add: [$studentId], remove: []}')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/courses/$COURSE_ID/students" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$ENROLL_BODY")

show_response "$STATUS"
expect_status "$STATUS" "204"

pause_if_needed

explain "This retrieves the course roster as admin."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X GET "$BASE_URL/courses/$COURSE_ID/students" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

show_response "$STATUS"
expect_status "$STATUS" "200"

pause_if_needed

explain "This retrieves the course roster as the assigned instructor."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X GET "$BASE_URL/courses/$COURSE_ID/students" \
  -H "Authorization: Bearer $INSTRUCTOR_TOKEN")

show_response "$STATUS"
expect_status "$STATUS" "200"

pause_if_needed

explain "This demonstrates authorization: student attempts to view full roster and should be rejected."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X GET "$BASE_URL/courses/$COURSE_ID/students" \
  -H "Authorization: Bearer $STUDENT_TOKEN")

show_response "$STATUS"
expect_status "$STATUS" "403"

pause_if_needed

# ---------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------

section "Assignment creation, retrieval, update, and authorization"

explain "This creates an assignment as the assigned instructor."

CREATE_ASSIGNMENT_BODY=$(jq -n \
  --arg title "Demo Assignment" \
  --argjson points 100 \
  --arg due "2026-12-31T23:59:59.000Z" \
  --argjson courseId "$COURSE_ID" \
  '{
    title: $title,
    points: $points,
    due: $due,
    courseId: $courseId
  }')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/assignments" \
  -H "Authorization: Bearer $INSTRUCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CREATE_ASSIGNMENT_BODY")

show_response "$STATUS"
expect_status "$STATUS" "201"

ASSIGNMENT_ID=$(jq -r '.id // .assignmentId // .assignment_id // empty' "$BODY_FILE")

if [ -z "$ASSIGNMENT_ID" ]; then
  echo "ERROR: Could not extract assignment ID."
  exit 1
fi

echo "Saved assignment ID: $ASSIGNMENT_ID"

pause_if_needed

explain "This lists assignments for the course."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X GET "$BASE_URL/courses/$COURSE_ID/assignments")

show_response "$STATUS"
expect_status "$STATUS" "200"

pause_if_needed

explain "This retrieves the single assignment."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X GET "$BASE_URL/assignments/$ASSIGNMENT_ID")

show_response "$STATUS"
expect_status "$STATUS" "200"

pause_if_needed

explain "This updates the assignment points as instructor."

UPDATE_ASSIGNMENT_BODY=$(jq -n \
  --argjson points 150 \
  '{points: $points}')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X PATCH "$BASE_URL/assignments/$ASSIGNMENT_ID" \
  -H "Authorization: Bearer $INSTRUCTOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$UPDATE_ASSIGNMENT_BODY")

show_response "$STATUS"
expect_status "$STATUS" "204"

pause_if_needed

explain "This demonstrates authorization: student attempts to create assignment and should be rejected."

BAD_ASSIGNMENT_BODY=$(jq -n \
  --arg title "Unauthorized Student Assignment" \
  --argjson points 1 \
  --arg due "2026-12-31T23:59:59.000Z" \
  --argjson courseId "$COURSE_ID" \
  '{
    title: $title,
    points: $points,
    due: $due,
    courseId: $courseId
  }')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/assignments" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$BAD_ASSIGNMENT_BODY")

show_response "$STATUS"
expect_status "$STATUS" "403"

pause_if_needed

# ---------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------

section "Assignment submission upload and submission authorization"

explain "This uploads a submission file as the enrolled student."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/assignments/$ASSIGNMENT_ID/submissions" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -F "file=@$TEST_FILE")

show_response "$STATUS"
expect_status "$STATUS" "201"

pause_if_needed

explain "This retrieves assignment submissions as the instructor."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X GET "$BASE_URL/assignments/$ASSIGNMENT_ID/submissions" \
  -H "Authorization: Bearer $INSTRUCTOR_TOKEN")

show_response "$STATUS"
expect_status "$STATUS" "200"

pause_if_needed

explain "This demonstrates authorization: student attempts to list all submissions and should be rejected."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X GET "$BASE_URL/assignments/$ASSIGNMENT_ID/submissions" \
  -H "Authorization: Bearer $STUDENT_TOKEN")

show_response "$STATUS"
expect_status "$STATUS" "403"

pause_if_needed

explain "This demonstrates authentication: no-token request to protected submissions route should be rejected."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X GET "$BASE_URL/assignments/$ASSIGNMENT_ID/submissions")

show_response "$STATUS"
expect_status "$STATUS" "403"

pause_if_needed

# ---------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------

section "Cleanup"

explain "This removes the student from the course."

REMOVE_STUDENT_BODY=$(jq -n \
  --argjson studentId "$STUDENT_ID" \
  '{add: [], remove: [$studentId]}')

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X POST "$BASE_URL/courses/$COURSE_ID/students" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$REMOVE_STUDENT_BODY")

show_response "$STATUS"
expect_status "$STATUS" "204"

pause_if_needed

explain "This deletes the assignment as instructor."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X DELETE "$BASE_URL/assignments/$ASSIGNMENT_ID" \
  -H "Authorization: Bearer $INSTRUCTOR_TOKEN")

show_response "$STATUS"
expect_status "$STATUS" "204"

pause_if_needed

explain "This deletes the course as admin."

STATUS=$(curl -s -o "$BODY_FILE" -w "%{http_code}" \
  -X DELETE "$BASE_URL/courses/$COURSE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

show_response "$STATUS"
expect_status "$STATUS" "204"

pause_if_needed

# ---------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------

section "Demo script complete"

echo "Demonstrated:"
echo "  - admin login from clean seed state"
echo "  - instructor and student creation"
echo "  - login for each role"
echo "  - user access authorization"
echo "  - course creation/update/delete"
echo "  - course enrollment and roster access"
echo "  - assignment creation/update/delete"
echo "  - student file submission"
echo "  - instructor submission listing"
echo "  - expected authentication and authorization failures"
echo
echo "Done."