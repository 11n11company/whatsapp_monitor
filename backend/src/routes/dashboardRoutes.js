const express = require('express');
const { getDashboardOverview } = require('../controllers/dashboardController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Protected dashboard routes
router.get('/overview', authenticateToken, getDashboardOverview);

module.exports = router;

