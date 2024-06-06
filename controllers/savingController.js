const db = require('../config/database');

exports.createSaving = (req, res) => {
    const { amount, date } = req.body;
    const userId = req.session.userId;
    const sql = 'INSERT INTO savings (user_id, amount, date) VALUES (?, ?, ?)';
    db.query(sql, [userId, amount, date], (err, result) => {
        if (err) throw err;
        res.status(201).send('Épargne créée');
    });
};

exports.getSavings = (req, res) => {
    const userId = req.session.userId;
    const sql = 'SELECT * FROM savings WHERE user_id = ?';
    db.query(sql, [userId], (err, results) => {
        if (err) throw err;
        res.send(results);
    });
};
