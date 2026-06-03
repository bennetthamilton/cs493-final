const express = require('express');

const router = express.Router();

router.get('/', async (req, res) => {
  res.status(501).json({
    error: 'Courses routes not implemented yet'
  });
});

module.exports = router;