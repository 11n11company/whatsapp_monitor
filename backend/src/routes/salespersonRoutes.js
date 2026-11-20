const express = require('express');
const {
  listSalespersons,
  getSalespersonById,
  createSalesperson,
  updateSalesperson,
  deleteSalesperson,
} = require('../controllers/salespersonController');
const CustomerController = require('../controllers/customerController');
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  validateUUIDParam,
  validateCreateSalesperson,
  validateUpdateSalesperson,
} = require('../middleware/validateSalesperson');
const { validateUUID } = require('../middleware/validateUUID');

const router = express.Router();

// Enforce admin authentication on all salesperson endpoints
router.use(authenticateToken);

// Salesperson endpoints
router.get('/', listSalespersons);
router.post('/', validateCreateSalesperson, createSalesperson);
router.get('/:id', validateUUIDParam, getSalespersonById);
router.patch('/:id', validateUpdateSalesperson, updateSalesperson);
router.delete('/:id', validateUUIDParam, deleteSalesperson);
router.get('/:salespersonId/customers', validateUUIDParam, CustomerController.getCustomersBySalesperson);
router.get(
  '/:salespersonId/customers/:customerId/conversation',
  validateUUID('salespersonId'),
  validateUUID('customerId'),
  CustomerController.getSalespersonCustomerConversation
);

module.exports = router;

