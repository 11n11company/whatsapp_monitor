const express = require('express');
const ConversationController = require('../controllers/conversationController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { validateUUID } = require('../middleware/validateUUID');

const router = express.Router();

// Enforce admin authentication on all conversation endpoints
router.use(authenticateToken);

// GET /api/conversations/:conversationId/messages
router.get(
  '/:conversationId/messages',
  validateUUID('conversationId'),
  ConversationController.getConversationMessages
);

module.exports = router;
