require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const path = require('path');

const usersRouter = require('./routes/users');
const coursesRouter = require('./routes/courses');
const assignmentsRouter = require('./routes/assignments');
const rateLimit = require('./middleware/rateLimit');

const app = express();
const port = process.env.PORT || 8000;

app.use(morgan('dev'));
app.use(express.json());

app.use(rateLimit);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/users', usersRouter);
app.use('/courses', coursesRouter);
app.use('/assignments', assignmentsRouter);

app.use((req, res) => {
  res.status(404).json({
    error: 'Requested resource not found'
  });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});