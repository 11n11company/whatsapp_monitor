const express = require('express');
const MediaController = require('../controllers/mediaController');
const { authenticateToken, verifyMediaTicket } = require('../middleware/authMiddleware');
const { validateUUID } = require('../middleware/validateUUID');

const router = express.Router();

// POST /api/media/:mediaId/ticket
// Generate short-lived (5 min) scoped ticket for browser media playback
router.post(
  '/:mediaId/ticket',
  validateUUID('mediaId'),
  authenticateToken,
  MediaController.issueTicket
);

// GET /api/media/:mediaId
// Streams private media attachment via Authorization header OR ?ticket=<scopedTicket>
router.get(
  '/:mediaId',
  validateUUID('mediaId'),
  verifyMediaTicket,
  MediaController.getMedia
);

module.exports = router;
