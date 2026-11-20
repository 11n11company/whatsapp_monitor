const fs = require('fs');
const MediaService = require('../services/media/mediaService');
const MediaModel = require('../models/mediaModel');
const { createMediaTicket } = require('../middleware/authMiddleware');

class MediaController {
  /**
   * POST /api/media/:mediaId/ticket
   * Issues a short-lived (5 min), single-media scoped access ticket for browser streaming
   */
  static async issueTicket(req, res, next) {
    try {
      const { mediaId } = req.params;
      const record = await MediaModel.findById(mediaId);

      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Media attachment not found.',
        });
      }

      const ticket = createMediaTicket(mediaId, req.user);

      return res.status(200).json({
        success: true,
        mediaId,
        ticket,
        expiresInSeconds: 300, // 5 minutes
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/media/:mediaId
   * Streams private media attachment to authenticated admin with Range support
   */
  static async getMedia(req, res, next) {
    try {
      const { mediaId } = req.params;
      const media = await MediaService.getMediaForStreaming(mediaId);

      if (!media) {
        // Check if metadata exists even if physical file is pending retrieval or unavailable
        const record = await MediaModel.findById(mediaId);
        if (record) {
          return res.status(404).json({
            success: false,
            code: 'MEDIA_UNAVAILABLE',
            status: 'unavailable',
            message: 'Media attachment file is unavailable or expired.',
            data: {
              id: record.id,
              file_name: record.file_name,
              mime_type: record.mime_type,
            },
          });
        }
        return res.status(404).json({
          success: false,
          message: 'Media attachment not found.',
        });
      }

      const { record, fullPath } = media;
      const stat = fs.statSync(fullPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      // Safe Audit Logging (No secrets, no tokens, no sensitive parameters logged)
      console.log(`[AUDIT] Media stream accessed: ${mediaId} (${record.file_name}) by admin [${req.user?.username || 'authorized'}]`);

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize) {
          res.setHeader('Content-Range', `bytes */${fileSize}`);
          return res.status(416).json({ success: false, message: 'Requested range not satisfiable' });
        }

        const chunksize = end - start + 1;
        const fileStream = fs.createReadStream(fullPath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': record.mime_type || 'application/octet-stream',
          'Content-Disposition': `inline; filename="${record.file_name}"`,
          'Cache-Control': 'private, max-age=86400',
        });
        fileStream.on('error', (err) => next(err));
        return fileStream.pipe(res);
      }

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': record.mime_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${record.file_name}"`,
        'Cache-Control': 'private, max-age=86400',
      });

      const stream = fs.createReadStream(fullPath);
      stream.on('error', (err) => next(err));
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = MediaController;
