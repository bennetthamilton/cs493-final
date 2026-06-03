CREATE DATABASE IF NOT EXISTS tarpaulin;
USE tarpaulin;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'instructor', 'student') NOT NULL DEFAULT 'student'
);

CREATE TABLE IF NOT EXISTS courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject VARCHAR(16) NOT NULL,
  number VARCHAR(16) NOT NULL,
  title VARCHAR(255) NOT NULL,
  term VARCHAR(32) NOT NULL,
  instructor_id INT NOT NULL,
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS enrollments (
  course_id INT NOT NULL,
  student_id INT NOT NULL,
  PRIMARY KEY (course_id, student_id),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  course_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  points INT NOT NULL,
  due DATETIME NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  grade FLOAT NULL,
  file_url VARCHAR(1024) NOT NULL,
  file_path VARCHAR(1024) NOT NULL,
  original_filename VARCHAR(255),
  mime_type VARCHAR(255),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Initial placeholder admin user with password "adminpassword" (hashed using bcrypt)
INSERT IGNORE INTO users (id, name, email, password_hash, role)
VALUES (
  1,
  'Admin User',
  'admin@example.com',
  '$2b$10$CwTycUXWue0Thq9StjUM0uJ8zT7M5b9R3eNQKONxI5Y2fK8kPqJ8i',
  'admin'
);