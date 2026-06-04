const express = require('express');

const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const PAGE_SIZE = 10;

async function getCourseById(courseId) {
  const [rows] = await db.execute(
    `
      SELECT
        c.id,
        c.subject,
        c.number,
        c.title,
        c.term,
        c.instructor_id AS instructorId
      FROM courses c
      WHERE c.id = ?
    `,
    [courseId]
  );

  return rows[0];
}

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function formatCourse(course) {
  return {
    id: course.id,
    subject: course.subject,
    number: course.number,
    title: course.title,
    term: course.term,
    instructorId: course.instructorId
  };
}


router.get('/', async (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  const limit = Number(PAGE_SIZE);
  const safeOffset = Number(offset);

  try {
    const [courses] = await db.execute(
      `
        SELECT
          id,
          subject,
          number,
          title,
          term,
          instructor_id AS instructorId
        FROM courses
        ORDER BY id
        LIMIT ${limit} OFFSET ${safeOffset}
      `,
      [PAGE_SIZE, offset]
    );

    const [countRows] = await db.execute(
      `
        SELECT COUNT(*) AS count
        FROM courses
      `
    );

    const count = countRows[0].count;
    const lastPage = Math.ceil(count / PAGE_SIZE);

    const response = {
      courses: courses.map(formatCourse),
      page,
      totalPages: lastPage,
      pageSize: PAGE_SIZE,
      totalCount: count
    };

    if (page < lastPage) {
      response.nextPage = `/courses?page=${page + 1}`;
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});


router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { subject, number, title, term, instructorId } = req.body;

  if (!subject || !number || !title || !term || !isPositiveInteger(instructorId)) {
    return res.status(400).json({
      error: 'Request body must include subject, number, title, term, and instructorId'
    });
  }

  try {
    const [instructors] = await db.execute(
      `
        SELECT id
        FROM users
        WHERE id = ? AND role = 'instructor'
      `,
      [instructorId]
    );

    if (instructors.length === 0) {
      return res.status(400).json({
        error: 'instructorId must reference an existing instructor user'
      });
    }

    const [result] = await db.execute(
      `
        INSERT INTO courses (subject, number, title, term, instructor_id)
        VALUES (?, ?, ?, ?, ?)
      `,
      [subject, number, title, term, instructorId]
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
  const courseId = Number(req.params.id);

  if (!isPositiveInteger(courseId)) {
    return res.status(400).json({
      error: 'Course ID must be a positive integer'
    });
  }

  try {
    const course = await getCourseById(courseId);

    if (!course) {
      return res.status(404).json({
        error: 'Specified course not found'
      });
    }

    return res.status(200).json(formatCourse(course));
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});


router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const courseId = Number(req.params.id);
  const { subject, number, title, term, instructorId } = req.body;

  if (!isPositiveInteger(courseId)) {
    return res.status(400).json({
      error: 'Course ID must be a positive integer'
    });
  }

  const fields = [];
  const values = [];

  if (subject !== undefined) {
    fields.push('subject = ?');
    values.push(subject);
  }

  if (number !== undefined) {
    fields.push('number = ?');
    values.push(number);
  }

  if (title !== undefined) {
    fields.push('title = ?');
    values.push(title);
  }

  if (term !== undefined) {
    fields.push('term = ?');
    values.push(term);
  }

  if (instructorId !== undefined) {
    if (!isPositiveInteger(instructorId)) {
      return res.status(400).json({
        error: 'instructorId must be a positive integer'
      });
    }

    fields.push('instructor_id = ?');
    values.push(instructorId);
  }

  if (fields.length === 0) {
    return res.status(400).json({
      error: 'Request body must contain at least one course field to update'
    });
  }

  try {
    const existingCourse = await getCourseById(courseId);

    if (!existingCourse) {
      return res.status(404).json({
        error: 'Specified course not found'
      });
    }

    if (instructorId !== undefined) {
      const [instructors] = await db.execute(
        `
          SELECT id
          FROM users
          WHERE id = ? AND role = 'instructor'
        `,
        [instructorId]
      );

      if (instructors.length === 0) {
        return res.status(400).json({
          error: 'instructorId must reference an existing instructor user'
        });
      }
    }

    values.push(courseId);

    await db.execute(
      `
        UPDATE courses
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


router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const courseId = Number(req.params.id);

  if (!isPositiveInteger(courseId)) {
    return res.status(400).json({
      error: 'Course ID must be a positive integer'
    });
  }

  try {
    const existingCourse = await getCourseById(courseId);

    if (!existingCourse) {
      return res.status(404).json({
        error: 'Specified course not found'
      });
    }

    await db.execute(
      `
        DELETE FROM courses
        WHERE id = ?
      `,
      [courseId]
    );

    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});


router.get('/:id/students', requireAuth, async (req, res) => {
  const courseId = Number(req.params.id);

  if (!isPositiveInteger(courseId)) {
    return res.status(400).json({
      error: 'Course ID must be a positive integer'
    });
  }

  try {
    const course = await getCourseById(courseId);

    if (!course) {
      return res.status(404).json({
        error: 'Specified course not found'
      });
    }

    const isAdmin = req.user.role === 'admin';
    const isCourseInstructor =
      req.user.role === 'instructor' && req.user.id === course.instructorId;

    if (!isAdmin && !isCourseInstructor) {
      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }

    const [students] = await db.execute(
      `
        SELECT
          u.id,
          u.name,
          u.email
        FROM enrollments e
        INNER JOIN users u ON e.student_id = u.id
        WHERE e.course_id = ?
        ORDER BY u.id
      `,
      [courseId]
    );

    return res.status(200).json({
      students
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});


router.post('/:id/students', requireAuth, async (req, res) => {
  const courseId = Number(req.params.id);
  const { add = [], remove = [] } = req.body;

  if (!isPositiveInteger(courseId)) {
    return res.status(400).json({
      error: 'Course ID must be a positive integer'
    });
  }

  if (!Array.isArray(add) || !Array.isArray(remove)) {
    return res.status(400).json({
      error: 'Request body must include add and remove arrays'
    });
  }

  if (![...add, ...remove].every(isPositiveInteger)) {
    return res.status(400).json({
      error: 'All student IDs must be positive integers'
    });
  }

  try {
    const course = await getCourseById(courseId);

    if (!course) {
      return res.status(404).json({
        error: 'Specified course not found'
      });
    }

    const isAdmin = req.user.role === 'admin';
    const isCourseInstructor =
      req.user.role === 'instructor' && req.user.id === course.instructorId;

    if (!isAdmin && !isCourseInstructor) {
      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }

    for (const studentId of add) {
      const [students] = await db.execute(
        `
          SELECT id
          FROM users
          WHERE id = ? AND role = 'student'
        `,
        [studentId]
      );

      if (students.length === 0) {
        return res.status(400).json({
          error: `User ${studentId} is not a valid student`
        });
      }

      await db.execute(
        `
          INSERT IGNORE INTO enrollments (course_id, student_id)
          VALUES (?, ?)
        `,
        [courseId, studentId]
      );
    }

    for (const studentId of remove) {
      await db.execute(
        `
          DELETE FROM enrollments
          WHERE course_id = ? AND student_id = ?
        `,
        [courseId, studentId]
      );
    }

    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});


router.get('/:id/roster', requireAuth, async (req, res) => {
  const courseId = Number(req.params.id);

  if (!isPositiveInteger(courseId)) {
    return res.status(400).json({
      error: 'Course ID must be a positive integer'
    });
  }

  try {
    const course = await getCourseById(courseId);

    if (!course) {
      return res.status(404).json({
        error: 'Specified course not found'
      });
    }

    const isAdmin = req.user.role === 'admin';
    const isCourseInstructor =
      req.user.role === 'instructor' && req.user.id === course.instructorId;

    if (!isAdmin && !isCourseInstructor) {
      return res.status(403).json({
        error: 'Insufficient permissions'
      });
    }

    const [students] = await db.execute(
      `
        SELECT
          u.id,
          u.name,
          u.email
        FROM enrollments e
        INNER JOIN users u ON e.student_id = u.id
        WHERE e.course_id = ?
        ORDER BY u.id
      `,
      [courseId]
    );

    const csvRows = students.map(student => {
      return `"${student.id}","${student.name}","${student.email}"`;
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="course-${courseId}-roster.csv"`
    );

    return res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});


router.get('/:id/assignments', async (req, res) => {
  const courseId = Number(req.params.id);

  if (!isPositiveInteger(courseId)) {
    return res.status(400).json({
      error: 'Course ID must be a positive integer'
    });
  }

  try {
    const course = await getCourseById(courseId);

    if (!course) {
      return res.status(404).json({
        error: 'Specified course not found'
      });
    }

    const [assignments] = await db.execute(
      `
        SELECT
          id,
          course_id AS courseId,
          title,
          points,
          due
        FROM assignments
        WHERE course_id = ?
        ORDER BY id
      `,
      [courseId]
    );

    return res.status(200).json({
      assignments
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;