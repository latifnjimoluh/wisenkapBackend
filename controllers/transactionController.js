const db = require('../config/database');

exports.createTransaction = (req, res) => {
    const { budgetId, description, amount, date } = req.body;
    const sql = 'INSERT INTO transactions (budget_id, description, amount, date) VALUES (?, ?, ?, ?)';
    db.query(sql, [budgetId, description, amount, date], (err, result) => {
        if (err) throw err;
        res.status(201).send('Transaction créée');
    });
};

exports.getTransactions = (req, res) => {
    const userId = req.session.userId;
    const sql = 'SELECT * FROM transactions WHERE budget_id IN (SELECT id FROM budgets WHERE user_id = ?)';
    db.query(sql, [userId], (err, results) => {
        if (err) throw err;
        res.send(results);
    });
};
