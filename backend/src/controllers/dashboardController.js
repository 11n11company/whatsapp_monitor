const db = require('../config/db');
const SalespersonModel = require('../models/salespersonModel');

/**
 * Controller for Admin Dashboard metrics
 * Strictly database-driven from PostgreSQL
 */
async function getDashboardOverview(req, res, next) {
  try {
    // 1. Salesperson metrics
    const spStats = await SalespersonModel.getStats();

    // 2. Customer metrics
    const custResult = await db.query('SELECT COUNT(*) AS total FROM customers;');
    const totalCustomers = parseInt(custResult.rows[0]?.total || '0', 10);

    // 3. Conversation metrics
    const convResult = await db.query('SELECT COUNT(*) AS total FROM conversations;');
    const totalConversations = parseInt(convResult.rows[0]?.total || '0', 10);

    // 4. Recent activity from actual messages
    const activityResult = await db.query(`
      SELECT 
        m.id,
        m.direction,
        m.message_type,
        m.message_text,
        m.message_timestamp,
        m.created_at,
        s.id AS salesperson_id,
        s.name AS salesperson_name,
        s.phone_number AS salesperson_phone,
        c.id AS customer_id,
        c.display_name AS customer_name,
        c.phone_number AS customer_phone
      FROM messages m
      JOIN salespersons s ON s.id = m.salesperson_id
      JOIN customers c ON c.id = m.customer_id
      ORDER BY m.message_timestamp DESC, m.created_at DESC
      LIMIT 10;
    `);

    const recentActivity = activityResult.rows.map((row) => {
      const isIncoming = row.direction === 'incoming';
      const customerLabel = row.customer_name || row.customer_phone || 'Customer';
      const actionText = isIncoming
        ? `Received ${row.message_type || 'message'} from ${customerLabel}`
        : `Sent ${row.message_type || 'message'} to ${customerLabel}`;

      return {
        id: row.id,
        salesperson: row.salesperson_name,
        phone: row.salesperson_phone,
        action: actionText,
        time: row.message_timestamp ? new Date(row.message_timestamp).toISOString() : new Date(row.created_at).toISOString(),
        status: isIncoming ? 'incoming' : 'outgoing',
        preview: row.message_text
          ? (row.message_text.length > 60 ? row.message_text.substring(0, 60) + '...' : row.message_text)
          : `[${row.message_type || 'Attachment'}]`,
      };
    });

    const stats = {
      timestamp: new Date().toISOString(),
      overview: {
        totalSalespersons: {
          value: spStats.total,
          change: spStats.total > 0 ? `${spStats.active} active salespersons` : '0 registered',
          changeType: 'positive',
          label: 'Total Salespersons',
          description: 'Registered sales team members',
        },
        connectedAccounts: {
          value: spStats.connected,
          activeOf: spStats.active,
          change: spStats.active > 0
            ? `${Math.round((spStats.connected / spStats.active) * 100)}% connection rate`
            : '0% connection rate',
          changeType: 'neutral',
          label: 'Connected WhatsApp Accounts',
          description: 'WhatsApp sessions currently linked',
        },
        totalCustomers: {
          value: totalCustomers,
          change: totalCustomers > 0 ? `${totalCustomers} total identified` : '0 identified',
          changeType: 'positive',
          label: 'Total Customers',
          description: 'Customers identified across chats',
        },
        totalConversations: {
          value: totalConversations,
          change: totalConversations > 0 ? `${totalConversations} active threads` : '0 active threads',
          changeType: 'positive',
          label: 'Total Conversations',
          description: 'Logged WhatsApp message threads',
        },
      },
      recentActivity,
    };

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboardOverview,
};
