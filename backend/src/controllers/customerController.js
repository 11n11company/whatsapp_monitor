const CustomerModel = require('../models/customerModel');
const SalespersonModel = require('../models/salespersonModel');
const ConversationModel = require('../models/conversationModel');

class CustomerController {
  /**
   * GET /api/salespersons/:salespersonId/customers
   * List paginated customers belonging exclusively to the specified salesperson
   */
  static async getCustomersBySalesperson(req, res, next) {
    try {
      const { salespersonId } = req.params;

      // 1. Verify salesperson exists
      const salesperson = await SalespersonModel.findById(salespersonId);
      if (!salesperson) {
        return res.status(404).json({
          success: false,
          message: 'Salesperson not found.',
        });
      }

      // 2. Parse query parameters
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const offset = (page - 1) * limit;
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

      // 3. Query customers with latest conversation preview
      const customers = await CustomerModel.findBySalespersonId(salespersonId, {
        search,
        limit,
        offset,
      });

      const total = await CustomerModel.countBySalespersonId(salespersonId, { search });

      return res.status(200).json({
        success: true,
        data: customers,
        salesperson: {
          id: salesperson.id,
          name: salesperson.name,
          phone_number: salesperson.phone_number,
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

  /**
   * GET /api/customers/:customerId
   * Get single customer details
   */
  static async getCustomerById(req, res, next) {
    try {
      const { customerId } = req.params;
      const customer = await CustomerModel.findById(customerId);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found.',
        });
      }

      return res.status(200).json({
        success: true,
        data: customer,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/customers/:customerId/conversations
   * Get conversations for a customer
   */
  static async getCustomerConversations(req, res, next) {
    try {
      const { customerId } = req.params;

      // Verify customer exists
      const customer = await CustomerModel.findById(customerId);
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found.',
        });
      }

      const conversations = await ConversationModel.findByCustomerId(customerId);

      return res.status(200).json({
        success: true,
        data: conversations,
        customer: {
          id: customer.id,
          display_name: customer.display_name,
          phone_number: customer.phone_number,
          whatsapp_id: customer.whatsapp_id,
          contact_type: customer.contact_type || (customer.whatsapp_id?.endsWith('@g.us') ? 'group' : 'individual'),
          group_subject: customer.group_subject || null,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/salespersons/:salespersonId/customers/:customerId/conversation
   * Secure endpoint verifying salesperson-customer ownership and returning conversation
   */
  static async getSalespersonCustomerConversation(req, res, next) {
    try {
      const { salespersonId, customerId } = req.params;

      const salesperson = await SalespersonModel.findById(salespersonId);
      if (!salesperson) {
        return res.status(404).json({
          success: false,
          message: 'Salesperson not found.',
        });
      }

      const customer = await CustomerModel.findById(customerId);
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found.',
        });
      }

      // Security Check: Enforce salesperson ownership
      if (customer.salesperson_id !== salespersonId) {
        return res.status(403).json({
          success: false,
          code: 'CROSS_SALESPERSON_FORBIDDEN',
          message: 'Access denied. Customer belongs to a different salesperson.',
        });
      }

      const conversation = await ConversationModel.findOrCreate(salespersonId, customerId);

      return res.status(200).json({
        success: true,
        data: conversation,
        customer,
        salesperson: {
          id: salesperson.id,
          name: salesperson.name,
          phone_number: salesperson.phone_number,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = CustomerController;

