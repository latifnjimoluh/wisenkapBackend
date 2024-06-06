const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetController');

router.post('/', budgetController.createBudget);
router.get('/', budgetController.getBudgets);

module.exports = router;
