const express = require('express');
const router = express.Router();
const savingController = require('../controllers/savingController');

router.post('/', savingController.createSaving);
router.get('/', savingController.getSavings);

module.exports = router;
