const ConversationModel = require('../models/conversationModel');
const MessageModel = require('../models/messageModel');

class ConversationController {
  /**
   * GET /api/conversations/:conversationId/messages
   * Returns paginated messages for a conversation sorted chronologically
   */
  static async getConversationMessages(req, res, next) {
    try {
      const { conversationId } = req.params;
      const { salespersonId } = req.query;

      // 1. Verify conversation exists
      const conversation = await ConversationModel.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found.',
        });
      }

      // Security Check: Verify conversation belongs to requested salesperson
      if (salespersonId && conversation.salesperson_id !== salespersonId) {
        return res.status(403).json({
          success: false,
          code: 'CROSS_SALESPERSON_FORBIDDEN',
          message: 'Access denied. Conversation belongs to a different salesperson.',
        });
      }

      // 2. Parse pagination parameters (default: 20 messages for fast conversation rendering)
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const offset = (page - 1) * limit;

      // 3. Query messages sorted chronologically
      const messages = await MessageModel.findByConversationId(conversationId, {
        limit,
        offset,
      });

      const total = await MessageModel.countByConversationId(conversationId);

      return res.status(200).json({
        success: true,
        data: messages,
        conversation: {
          id: conversation.id,
          salesperson_id: conversation.salesperson_id,
          salesperson_name: conversation.salesperson_name,
          salesperson_phone: conversation.salesperson_phone,
          customer_id: conversation.customer_id,
          customer_name: conversation.customer_name,
          customer_phone: conversation.customer_phone,
          whatsapp_id: conversation.whatsapp_id,
          contact_type: conversation.contact_type || (conversation.whatsapp_id?.endsWith('@g.us') ? 'group' : 'individual'),
          group_subject: conversation.group_subject || null,
          last_message_at: conversation.last_message_at,
          last_message_preview: conversation.last_message_preview,
        },
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ConversationController;

