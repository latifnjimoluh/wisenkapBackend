const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Connexion MySQL
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error('Erreur de connexion à MySQL:', err);
    throw err;
  }
  console.log('MySQL connecté...');
});

// Middlewares
app.use(cors({
  origin: process.env.CLIENT_URL, 
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Route de test
app.get('/test', (req, res) => {
  res.send('Le serveur fonctionne');
});

// Route d'inscription
app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  console.log('Requête d\'inscription reçue:', { email, password });

  if (!email || !password) {
    console.error('Échec de l\'inscription: Email ou mot de passe manquant');
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = { email, password: hashedPassword };

  const query = 'INSERT INTO users SET ?';
  db.query(query, newUser, (err, result) => {
    if (err) {
      console.error('Échec de l\'inscription:', err);
      return res.status(500).json({ message: 'Erreur lors de la création de l\'utilisateur.', error: err });
    }
    console.log('Utilisateur créé:', result);
    res.status(201).json({ message: 'Utilisateur créé avec succès.' });
  });
});

// Route de connexion
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  console.log('Requête de connexion reçue:', { email, password });

  if (!email || !password) {
    console.error('Échec de la connexion: Email ou mot de passe manquant');
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  }

  const query = 'SELECT * FROM users WHERE email = ?';
  db.query(query, [email], async (err, results) => {
    if (err) {
      console.error('Échec de la connexion:', err);
      return res.status(500).json({ message: 'Erreur du serveur.', error: err });
    }

    if (results.length === 0) {
      console.warn('Échec de la connexion: Utilisateur non trouvé');
      return res.status(404).json({ message: 'Utilisateur non trouvé. Voulez-vous créer un compte ?' });
    }

    const user = results[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.warn('Échec de la connexion: Mot de passe incorrect');
      return res.status(400).json({ message: 'Mot de passe incorrect.' });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      gender: user.gender,
      dob: user.dob,
      country: user.country,
      postalCode: user.postalCode,
    };

    console.log('Connexion réussie:', req.session.user);
    res.status(200).json({ message: 'Connexion réussie.', user: req.session.user });
  });
});

// Récupérer les détails de l'utilisateur
app.get('/auth/user', (req, res) => {
  if (!req.session.user) {
    console.warn('Utilisateur non authentifié');
    return res.status(401).json({ message: 'Utilisateur non authentifié.' });
  }
  
  console.log('Requête des détails utilisateur pour l\'utilisateur ID:', req.session.user.id);

  const query = 'SELECT email, phone, firstName, gender, dob, country, postalCode FROM users WHERE id = ?';
  db.query(query, [req.session.user.id], (err, results) => {
    if (err) {
      console.error('Erreur lors de la récupération des détails utilisateur:', err);
      return res.status(500).json({ message: 'Erreur lors de la récupération des détails utilisateur.', error: err });
    }
    console.log('Détails utilisateur récupérés:', results[0]);
    res.status(200).json(results[0]);
  });
});

// Mettre à jour les détails de l'utilisateur
app.put('/auth/user', (req, res) => {
  if (!req.session.user) {
    console.warn('Utilisateur non authentifié');
    return res.status(401).json({ message: 'Utilisateur non authentifié.' });
  }

  const { phone, firstName, gender, dob, country, postalCode } = req.body;
  console.log('Requête de mise à jour des détails utilisateur pour l\'utilisateur ID:', req.session.user.id);

  const query = 'UPDATE users SET phone = ?, firstName = ?, gender = ?, dob = ?, country = ?, postalCode = ? WHERE id = ?';
  db.query(query, [phone, firstName, gender, dob, country, postalCode, req.session.user.id], (err, result) => {
    if (err) {
      console.error('Erreur lors de la mise à jour des détails utilisateur:', err);
      return res.status(500).json({ message: 'Erreur lors de la mise à jour des détails utilisateur.', error: err });
    }
    console.log('Détails utilisateur mis à jour:', result);
    res.status(200).json({ message: 'Informations utilisateur mises à jour avec succès.' });
  });
});

// Récupérer les budgets de l'utilisateur connecté
app.get('/budgets', (req, res) => {
  if (!req.session.user) {
    console.warn('Utilisateur non authentifié');
    return res.status(401).json({ message: 'Utilisateur non authentifié.' });
  }

  console.log('Requête de récupération des budgets pour l\'utilisateur ID:', req.session.user.id);

  const query = 'SELECT * FROM budgets WHERE userId = ?';
  db.query(query, [req.session.user.id], (err, results) => {
    if (err) {
      console.error('Erreur lors de la récupération des budgets:', err);
      return res.status(500).json({ message: 'Erreur lors de la récupération des budgets.', error: err });
    }
    console.log('Budgets récupérés:', results);
    res.status(200).json(results);
  });
});

// Ajouter un budget
app.post('/budgets', (req, res) => {
  if (!req.session.user) {
    console.warn('Utilisateur non authentifié');
    return res.status(401).json({ message: 'Utilisateur non authentifié.' });
  }

  const { budgetName, period, startDate, revenues } = req.body;
  const userId = req.session.user.id;
  console.log('Requête d\'ajout de budget pour l\'utilisateur ID:', userId, { budgetName, period, startDate, revenues });

  const totalAmount = revenues.reduce((sum, revenue) => sum + parseFloat(revenue.amount || 0), 0);
  console.log('Montant total des revenus:', totalAmount);

  const queryBudget = 'INSERT INTO budgets (category, amount, userId, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())';
  db.query(queryBudget, [budgetName, totalAmount, userId], (err, result) => {
    if (err) {
      console.error('Erreur lors de l\'ajout du budget:', err);
      return res.status(500).json({ message: 'Erreur lors de l\'ajout du budget.', error: err });
    }
    const budgetId = result.insertId;
    console.log('Budget ajouté avec succès:', budgetId);

    const queryRevenue = 'INSERT INTO revenus (type, amount, userId, budgetId, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())';
    revenues.forEach(revenue => {
      db.query(queryRevenue, [revenue.type, revenue.amount, userId, budgetId], (err, result) => {
        if (err) {
          console.error('Erreur lors de l\'ajout du revenu:', err);
        } else {
          console.log('Revenu ajouté avec succès:', result.insertId);
        }
      });
    });

    // Ajout de la période dans la table periods
    const queryPeriod = 'INSERT INTO periods (period, startDate, budgetId, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())';
    db.query(queryPeriod, [period, startDate, budgetId], (err, result) => {
      if (err) {
        console.error('Erreur lors de l\'ajout de la période:', err);
      } else {
        console.log('Période ajoutée avec succès:', result.insertId);
      }
    });

    res.status(201).json({ message: 'Budget et revenus ajoutés avec succès.', budgetId });
  });
});

// Ajouter des dépenses à un budget
app.post('/budgets/:budgetId/expenses', (req, res) => {
  const { budgetId } = req.params;
  const { expenses } = req.body;

  console.log('Requête d\'ajout de dépenses pour le budget ID:', budgetId, { expenses });

  const queryExpense = 'INSERT INTO expenses (category, amount, budgetId, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())';

  expenses.forEach(expense => {
    db.query(queryExpense, [expense.category, expense.amount, budgetId], (err, result) => {
      if (err) {
        console.error('Erreur lors de l\'ajout de la dépense:', err);
      } else {
        console.log('Dépense ajoutée avec succès:', result.insertId);
      }
    });
  });

  res.status(201).json({ message: 'Dépenses ajoutées avec succès.' });
});

// Ajouter une épargne à un budget
app.post('/savings', (req, res) => {
  const { budgetId, amount, date } = req.body;

  console.log('Requête d\'ajout d\'épargne pour le budget ID:', budgetId, { amount, date });

  const querySaving = 'INSERT INTO savings (amount, date, budgetId, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())';

  db.query(querySaving, [amount, date, budgetId], (err, result) => {
    if (err) {
      console.error('Erreur lors de l\'ajout de l\'épargne:', err);
      return res.status(500).json({ message: 'Erreur lors de l\'ajout de l\'épargne.', error: err });
    }
    console.log('Épargne ajoutée avec succès:', result.insertId);
    res.status(201).json({ message: 'Épargne ajoutée avec succès.' });
  });
});



// Route de déconnexion
app.post('/auth/logout', (req, res) => {
  if (req.session.user) {
    console.log('Déconnexion de l\'utilisateur:', req.session.user.email);
    req.session.destroy((err) => {
      if (err) {
        console.error('Erreur lors de la destruction de la session:', err);
        return res.status(500).json({ message: 'Erreur lors de la déconnexion.' });
      }
      res.status(200).json({ message: 'Déconnexion réussie.' });
    });
  } else {
    console.warn('Échec de la déconnexion: Aucun utilisateur en session');
    return res.status(400).json({ message: 'Vous n\'êtes pas connecté.' });
  }
});


app.get('/budgets/:budgetId/expenses', (req, res) => {
  const { budgetId } = req.params;

  const query = 'SELECT * FROM expenses WHERE budgetId = ?';
  db.query(query, [budgetId], (err, results) => {
    if (err) {
      console.error('Erreur lors de la récupération des dépenses:', err);
      return res.status(500).json({ message: 'Erreur lors de la récupération des dépenses.', error: err });
    }
    res.status(200).json(results);
  });
});

// Ajouter des transactions
app.post('/transactions', (req, res) => {
  const { budgetId, transactions } = req.body;

  const query = 'INSERT INTO transactions (category, amount, budgetId, comment, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())';

  transactions.forEach(transaction => {
    const { category, amount, comment } = transaction;
    db.query(query, [category, amount, budgetId, comment], (err, result) => {
      if (err) {
        console.error('Erreur lors de l\'ajout de la transaction:', err);
      } else {
        console.log('Transaction ajoutée avec succès:', result.insertId);
      }
    });
  });

  res.status(201).json({ message: 'Transactions ajoutées avec succès.' });
});

app.listen(PORT, () => {
  console.log(`Le serveur fonctionne sur le port ${PORT}`);
});