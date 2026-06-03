const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/', async (req, res) => {
  const { name, email, password, role = 'student' } = req.body;

  if (!name || !email || !password || !['admin', 'instructor', 'student'].includes(role)) {
    return res.status(400).json({
      error: 'Request body must include valid name, email, password, and role'
    });
  }

  if ((role === 'admin' || role === 'instructor')) {
    const authHeader = req.get('Authorization') || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(403).json({
        error: 'Only admins can create admin or instructor users'
      });
    }

    try {
      const token = authHeader.slice('Bearer '.length);
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      if (payload.role !== 'admin') {
        return res.status(403).json({
          error: 'Only admins can create admin or instructor users'
        });
      }
    } catch {
      return res.status(403).json({
        error: 'Invalid authorization token'
      });
    }
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await db.execute(
      `
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, ?)
      `,
      [name, email, passwordHash, role]
    );

    return res.status(201).json({
      id: result.insertId
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        error: 'Email already exists'
      });
    }

    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'Request body must include email and password'
    });
  }

  try {
    const [rows] = await db.execute(
      `
        SELECT id, name, email, password_hash, role
        FROM users
        WHERE email = ?
      `,
      [email]
    );

    const user = rows[0];

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '24h'
      }
    );

    return res.status(200).json({
      token
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  const requestedId = Number(req.params.id);

  if (req.user.id !== requestedId) {
    return res.status(403).json({
      error: 'Users can only fetch their own data'
    });
  }

  try {
    const [users] = await db.execute(
      `
        SELECT id, name, email, role
        FROM users
        WHERE id = ?
      `,
      [requestedId]
    );

    const user = users[0];

    if (!user) {
      return res.status(404).json({
        error: 'Specified user not found'
      });
    }

    if (user.role === 'instructor') {
      const [courses] = await db.execute(
        `
          SELECT id
          FROM courses
          WHERE instructor_id = ?
        `,
        [user.id]
      );

      user.courses = courses.map(course => course.id);
    }

    if (user.role === 'student') {
      const [courses] = await db.execute(
        `
          SELECT course_id AS id
          FROM enrollments
          WHERE student_id = ?
        `,
        [user.id]
      );

      user.courses = courses.map(course => course.id);
    }

    return res.status(200).json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;