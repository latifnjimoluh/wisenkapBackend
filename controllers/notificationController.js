const db = require('../config/database');

exports.createNotification = (req, res) => {
    const { message, alertTime, isActive } = req.body;
    const userId = req.session.userId;
    const sql = 'INSERT INTO notifications (user_id, message, alertTime, isActive) VALUES (?, ?, ?, ?)';
    db.query(sql, [userId, message, alertTime, isActive], (err, result) => {
        if (err) throw err;
        res.status(201).send('Notification créée');
    });
};

exports.getNotifications = (req, res) => {
    const userId = req.session.userId;
    const sql = 'SELECT * FROM notifications WHERE user_id = ?';
    db.query(sql, [userId], (err, results) => {
        if (err) throw err;
        res.send(results);
    });
};
