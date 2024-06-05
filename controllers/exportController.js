const db = require('../config/database');
const PDFDocument = require('pdfkit');
const fs = require('fs');

exports.exportData = (req, res) => {
    const userId = req.session.userId;
    const { startDate, endDate } = req.query;

    const sql = 'SELECT * FROM transactions WHERE budget_id IN (SELECT id FROM budgets WHERE user_id = ?) AND date >= ? AND date <= ?';
    db.query(sql, [userId, startDate, endDate], (err, results) => {
        if (err) throw err;

        const doc = new PDFDocument();
        const fileName = `export_${Date.now()}.pdf`;
        const filePath = `./exports/${fileName}`;

        doc.pipe(fs.createWriteStream(filePath));
        doc.text('Export des transactions', { align: 'center' });

        results.forEach((transaction) => {
            doc.text(`Transaction: ${transaction.description}, Montant: ${transaction.amount}, Date: ${transaction.date}`);
        });

        doc.end();
        res.download(filePath);
    });
};
