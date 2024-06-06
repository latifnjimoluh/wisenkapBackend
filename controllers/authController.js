const bcrypt = require('bcrypt');
const db = require('../config/database');

exports.signup = (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    const sql = 'INSERT INTO utilisateurs (email, password) VALUES (?, ?)';
    db.query(sql, [email, hashedPassword], (err, result) => {
        if (err) throw err;
        res.status(201).send('Utilisateur inscrit');
    });
};

exports.login = (req, res) => {
    const { email, password } = req.body;
    const sql = 'SELECT * FROM utilisateurs WHERE email = ?';
    db.query(sql, [email], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            const user = results[0];
            if (bcrypt.compareSync(password, user.password)) {
                req.session.userId = user.id;
                req.session.email = user.email;
                req.session.nom = user.nom;
                req.session.telephone = user.telephone;
                res.send('Connecté');
            } else {
                res.status(401).send('Mot de passe incorrect');
            }
        } else {
            res.status(401).send('Utilisateur non trouvé');
        }
    });
};

exports.logout = (req, res) => {
    req.session.destroy();
    res.send('Déconnecté');
};
