const express = require('express');

const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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

module.exports = router;