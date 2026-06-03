const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PAGE_SIZE = 10;
const uploadDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `submission-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage });

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

async function getAssignmentById(assignmentId) {
  const [rows] = await db.execute(
    `
      SELECT
        a.id,
        a.course_id AS courseId,
        a.title,
        a.points,
        a.due,
        c.instructor_id AS instructorId
      FROM assignments a
      INNER JOIN courses c ON a.course_id = c.id
      WHERE a.id = ?
    `,
    [assignmentId]
  );

  return rows[0];
}

async function getCourseById(courseId) {
  const [rows] = await db.execute(
    `
      SELECT
        id,
        instructor_id AS instructorId
      FROM courses
      WHERE id = ?
    `,
    [courseId]
  );

  return rows[0];
}

async function isStudentEnrolled(courseId, studentId) {
  const [rows] = await db.execute(
    `
      SELECT course_id, student_id
      FROM enrollments
      WHERE course_id = ? AND student_id = ?
    `,
    [courseId, studentId]
  );

  return rows.length > 0;
}

function canManageCourse(user, course) {
  return (
    user.role === 'admin' ||
    (user.role === 'instructor' && user.id === course.instructorId)
  );
}

function canManageAssignment(user, assignment) {
  return (
    user.role === 'admin' ||
    (user.role === 'instructor' && user.id === assignment.instructorId)
  );
}

function formatAssignment(assignment) {
  return {
    id: assignment.id,
    courseId: assignment.courseId,
    title: assignment.title,
    points: assignment.points,
    due: assignment.due
  };
}


router.post('/', requireAuth, async (req, res) => {
  const { courseId, title, points, due } = req.body;

  if (
    !isPositiveInteger(courseId) ||
    !title ||
    !isPositiveInteger(points) ||
    !due
  ) {
    return res.status(400).json({
      error: 'Request body must include valid courseId, title, points, and due'
    });
  }

  try {
    const course = await getCourseById(courseId);

    if (!course) {
      return res.status(404).json({
        error: 'Specified course not found'
      });
    }

    if (!canManageCourse(req.user, course)) {
      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }

    const dueDate = new Date(due);

    if (Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({
        error: 'due must be a valid date'
      });
    }

    const [result] = await db.execute(
      `
        INSERT INTO assignments (course_id, title, points, due)
        VALUES (?, ?, ?, ?)
      `,
      [courseId, title, points, dueDate]
    );

    return res.status(201).json({
      id: result.insertId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});


router.get('/:id', async (req, res) => {
  const assignmentId = Number(req.params.id);

  if (!isPositiveInteger(assignmentId)) {
    return res.status(400).json({
      error: 'Assignment ID must be a positive integer'
    });
  }

  try {
    const assignment = await getAssignmentById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Specified assignment not found'
      });
    }

    return res.status(200).json(formatAssignment(assignment));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});


router.patch('/:id', requireAuth, async (req, res) => {
  const assignmentId = Number(req.params.id);
  const { title, points, due } = req.body;

  if (!isPositiveInteger(assignmentId)) {
    return res.status(400).json({
      error: 'Assignment ID must be a positive integer'
    });
  }

  const fields = [];
  const values = [];

  if (title !== undefined) {
    if (!title) {
      return res.status(400).json({
        error: 'title cannot be empty'
      });
    }

    fields.push('title = ?');
    values.push(title);
  }

  if (points !== undefined) {
    if (!isPositiveInteger(points)) {
      return res.status(400).json({
        error: 'points must be a positive integer'
      });
    }

    fields.push('points = ?');
    values.push(points);
  }

  if (due !== undefined) {
    const dueDate = new Date(due);

    if (Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({
        error: 'due must be a valid date'
      });
    }

    fields.push('due = ?');
    values.push(dueDate);
  }

  if (fields.length === 0) {
    return res.status(400).json({
      error: 'Request body must contain at least one assignment field to update'
    });
  }

  try {
    const assignment = await getAssignmentById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Specified assignment not found'
      });
    }

    if (!canManageAssignment(req.user, assignment)) {
      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }

    values.push(assignmentId);

    await db.execute(
      `
        UPDATE assignments
        SET ${fields.join(', ')}
        WHERE id = ?
      `,
      values
    );

    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});


router.delete('/:id', requireAuth, async (req, res) => {
  const assignmentId = Number(req.params.id);

  if (!isPositiveInteger(assignmentId)) {
    return res.status(400).json({
      error: 'Assignment ID must be a positive integer'
    });
  }

  try {
    const assignment = await getAssignmentById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Specified assignment not found'
      });
    }

    if (!canManageAssignment(req.user, assignment)) {
      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }

    await db.execute(
      `
        DELETE FROM assignments
        WHERE id = ?
      `,
      [assignmentId]
    );

    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});


router.post('/:id/submissions', requireAuth, upload.single('file'), async (req, res) => {
  const assignmentId = Number(req.params.id);

  if (!isPositiveInteger(assignmentId)) {
    return res.status(400).json({
      error: 'Assignment ID must be a positive integer'
    });
  }

  if (req.user.role !== 'student') {
    return res.status(403).json({
      error: 'Only students can submit assignments'
    });
  }

  if (!req.file) {
    return res.status(400).json({
      error: 'Submission file is required'
    });
  }

  try {
    const assignment = await getAssignmentById(assignmentId);

    if (!assignment) {
      fs.unlinkSync(req.file.path);

      return res.status(404).json({
        error: 'Specified assignment not found'
      });
    }

    const enrolled = await isStudentEnrolled(assignment.courseId, req.user.id);

    if (!enrolled) {
      fs.unlinkSync(req.file.path);

      return res.status(403).json({
        error: 'Student must be enrolled in the course to submit'
      });
    }

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 8000}`;
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

    const [result] = await db.execute(
      `
        INSERT INTO submissions (
          assignment_id,
          student_id,
          timestamp,
          file_url,
          file_path,
          original_filename,
          mime_type
        )
        VALUES (?, ?, NOW(), ?, ?, ?, ?)
      `,
      [
        assignmentId,
        req.user.id,
        fileUrl,
        req.file.path,
        req.file.originalname,
        req.file.mimetype
      ]
    );

    return res.status(201).json({
      id: result.insertId,
      assignmentId,
      studentId: req.user.id,
      timestamp: new Date().toISOString(),
      file: fileUrl
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});


router.get('/:id/submissions', requireAuth, async (req, res) => {
  const assignmentId = Number(req.params.id);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  if (!isPositiveInteger(assignmentId)) {
    return res.status(400).json({
      error: 'Assignment ID must be a positive integer'
    });
  }

  try {
    const assignment = await getAssignmentById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Specified assignment not found'
      });
    }

    if (!canManageAssignment(req.user, assignment)) {
      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }

    const [submissions] = await db.execute(
      `
        SELECT
          id,
          assignment_id AS assignmentId,
          student_id AS studentId,
          timestamp,
          grade,
          file_url AS file
        FROM submissions
        WHERE assignment_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `,
      [assignmentId, PAGE_SIZE, offset]
    );

    const [countRows] = await db.execute(
      `
        SELECT COUNT(*) AS count
        FROM submissions
        WHERE assignment_id = ?
      `,
      [assignmentId]
    );

    const count = countRows[0].count;
    const totalPages = Math.ceil(count / PAGE_SIZE);

    const response = {
      submissions,
      page,
      totalPages,
      pageSize: PAGE_SIZE,
      totalCount: count
    };

    if (page < totalPages) {
      response.nextPage = `/assignments/${assignmentId}/submissions?page=${page + 1}`;
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;