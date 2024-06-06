const db = require('../config/database');

exports.createBudget = (req, res) => {
    const { budgetName, period, startDate, revenues } = req.body;
    const userId = req.session.userId;
    const sql = 'INSERT INTO budgets (user_id, budgetName, period, startDate) VALUES (?, ?, ?, ?)';
    db.query(sql, [userId, budgetName, period, startDate], (err, result) => {
        if (err) throw err;
        const budgetId = result.insertId;
        revenues.forEach((revenue) => {
            const revenueSql = 'INSERT INTO transactions (budget_id, description, amount, date) VALUES (?, ?, ?, ?)';
            db.query(revenueSql, [budgetId, revenue.type, revenue.amount, startDate], (err) => {
                if (err) throw err;
            });
        });
        res.status(201).send('Budget créé');
    });
};

exports.getBudgets = (req, res) => {
    const userId = req.session.userId;
    const sql = 'SELECT * FROM budgets WHERE user_id = ?';
    db.query(sql, [userId], (err, results) => {
        if (err) throw err;
        res.send(results);
    });
};
