const express = require('express');
const CustomerController = require('../controllers/customerController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { validateUUID } = require('../middleware/validateUUID');

const router = express.Router();

// Enforce admin authentication on all customer endpoints
router.use(authenticateToken);

// GET /api/customers/:customerId
router.get(
  '/:customerId',
  validateUUID('customerId'),
  CustomerController.getCustomerById
);

// GET /api/customers/:customerId/conversations
router.get(
  '/:customerId/conversations',
  validateUUID('customerId'),
  CustomerController.getCustomerConversations
);

module.exports = router;
