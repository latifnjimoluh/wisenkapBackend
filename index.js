const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin'); // Ajouté

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialiser Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json'); // Remplacez par le chemin réel de votre fichier de clé de compte de service
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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

// Ajouter un jeton FCM
app.post('/notifications/token', (req, res) => {
  const { token } = req.body;
  const userId = req.session.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non authentifié.' });
  }

  const query = 'INSERT INTO fcm_tokens (userId, token) VALUES (?, ?) ON DUPLICATE KEY UPDATE token = ?';
  db.query(query, [userId, token, token], (err) => {
    if (err) {
      console.error('Erreur lors de l\'ajout du jeton FCM:', err);
      return res.status(500).json({ message: 'Erreur lors de l\'ajout du jeton FCM.', error: err });
    }
    res.status(200).json({ message: 'Jeton FCM ajouté avec succès.' });
  });
});

// Supprimer un jeton FCM
app.post('/notifications/remove-token', (req, res) => {
  const { token } = req.body;
  const userId = req.session.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Utilisateur non authentifié.' });
  }

  const query = 'DELETE FROM fcm_tokens WHERE userId = ? AND token = ?';
  db.query(query, [userId, token], (err) => {
    if (err) {
      console.error('Erreur lors de la suppression du jeton FCM:', err);
      return res.status(500).json({ message: 'Erreur lors de la suppression du jeton FCM.', error: err });
    }
    res.status(200).json({ message: 'Jeton FCM supprimé avec succès.' });
  });
});

// Fonction pour envoyer une notification
const sendNotification = async (userId, title, body) => {
  try {
    const query = 'SELECT token FROM fcm_tokens WHERE userId = ?';
    db.query(query, [userId], async (err, results) => {
      if (err) {
        console.error('Erreur lors de la récupération des jetons FCM:', err);
        return;
      }

      if (results.length > 0) {
        const tokens = results.map(result => result.token);
        const message = {
          notification: {
            title,
            body,
          },
          tokens,
        };

        const response = await admin.messaging().sendMulticast(message);
        console.log('Notifications envoyées:', response.successCount);
      } else {
        console.log('Aucun jeton FCM trouvé pour l\'utilisateur:', userId);
      }
    });
  } catch (error) {
    console.error('Erreur lors de l\'envoi de la notification:', error);
  }
};

// Récupérer les préférences de notification
app.get('/notifications', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Utilisateur non authentifié.' });
  }

  const query = 'SELECT * FROM notifications WHERE userId = ?';
  db.query(query, [req.session.user.id], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la récupération des préférences de notification.', error: err });
    }
    res.status(200).json(results[0]);
  });
});

// Mettre à jour les préférences de notification
app.put('/notifications', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Utilisateur non authentifié.' });
  }

  const { isEnabled, notificationTime } = req.body;
  const query = `
    INSERT INTO notifications (userId, isEnabled, notificationTime)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE isEnabled = VALUES(isEnabled), notificationTime = VALUES(notificationTime)
  `;

  db.query(query, [req.session.user.id, isEnabled, notificationTime], (err, result) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la mise à jour des préférences de notification.', error: err });
    }
    res.status(200).json({ message: 'Préférences de notification mises à jour avec succès.' });
  });
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
  const { email, password, fcmToken } = req.body; // Ajout de fcmToken
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

    // Ajouter le jeton FCM à la base de données
    if (fcmToken) {
      const tokenQuery = 'INSERT INTO fcm_tokens (userId, token) VALUES (?, ?) ON DUPLICATE KEY UPDATE token = ?';
      db.query(tokenQuery, [user.id, fcmToken, fcmToken], (err) => {
        if (err) {
          console.error('Erreur lors de l\'ajout du jeton FCM:', err);
        } else {
          console.log('Jeton FCM ajouté avec succès');
        }
      });
    }

    res.status(200).json({ message: 'Connexion réussie.', user: req.session.user });
  });
});

// Récupérer les détails de l'utilisateur
app.get('/auth/user', (req, res) => {
  if (!req.session.user) {
    console.warn('Utilisateur non authentifié');
    return res.status(401).json({ message: 'Utilisateur non authentifié.' });
  }

  const query = 'SELECT email, phone, firstName, gender, dob, country, postalCode, photoUri FROM users WHERE id = ?';
  db.query(query, [req.session.user.id], (err, results) => {
    if (err) {
      console.error('Erreur lors de la récupération des détails utilisateur:', err);
      return res.status(500).json({ message: 'Erreur lors de la récupération des détails utilisateur.', error: err });
    }
    res.status(200).json(results[0]);
  });
});

// Mettre à jour les détails de l'utilisateur
app.put('/auth/user', (req, res) => {
  if (!req.session.user) {
    console.warn('Utilisateur non authentifié');
    return res.status(401).json({ message: 'Utilisateur non authentifié.' });
  }

  const { phone, firstName, gender, dob, country, postalCode, photoUri } = req.body;

  const query = 'UPDATE users SET phone = ?, firstName = ?, gender = ?, dob = ?, country = ?, postalCode = ?, photoUri = ? WHERE id = ?';
  db.query(query, [phone, firstName, gender, dob, country, postalCode, photoUri, req.session.user.id], (err, result) => {
    if (err) {
      console.error('Erreur lors de la mise à jour des détails utilisateur:', err);
      return res.status(500).json({ message: 'Erreur lors de la mise à jour des détails utilisateur.', error: err });
    }
    res.status(200).json({ message: 'Informations utilisateur mises à jour avec succès.' });
  });
});

// Route de déconnexion
app.post('/auth/logout', (req, res) => {
  const { fcmToken } = req.body; // Ajouté pour supprimer le token à la déconnexion
  const userId = req.session.user?.id;

  if (userId) {
    console.log('Déconnexion de l\'utilisateur:', req.session.user.email);

    req.session.destroy((err) => {
      if (err) {
        console.error('Erreur lors de la destruction de la session:', err);
        return res.status(500).json({ message: 'Erreur lors de la déconnexion.' });
      }

      // Supprimer le jeton FCM
      if (fcmToken) {
        const query = 'DELETE FROM fcm_tokens WHERE userId = ? AND token = ?';
        db.query(query, [userId, fcmToken], (err) => {
          if (err) {
            console.error('Erreur lors de la suppression du jeton FCM:', err);
          } else {
            console.log('Jeton FCM supprimé avec succès');
          }
        });
      }

      res.status(200).json({ message: 'Déconnexion réussie.' });
    });
  } else {
    console.warn('Échec de la déconnexion: Aucun utilisateur en session');
    return res.status(400).json({ message: 'Vous n\'êtes pas connecté.' });
  }
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

// Ajouter des transactions à un budget
app.post('/transactions', (req, res) => {
  const { budgetId, transactions } = req.body;

  console.log('Requête d\'ajout de transactions pour le budget ID:', budgetId, { transactions });

  const queryTransaction = 'INSERT INTO transactions (category, amount, budgetId, comment, createdAt, updatedAt) VALUES (?, ?, ?, ?, NOW(), NOW())';
  const queryUpdateBudget = 'UPDATE budgets SET amount = amount - ? WHERE id = ?';

  const totalTransactionAmount = transactions.reduce((sum, transaction) => sum + parseFloat(transaction.amount || 0), 0);

  transactions.forEach(transaction => {
    db.query(queryTransaction, [transaction.category, transaction.amount, budgetId, transaction.comment || ''], (err, result) => {
      if (err) {
        console.error('Erreur lors de l\'ajout de la transaction:', err);
      } else {
        console.log('Transaction ajoutée avec succès:', result.insertId);
      }
    });
  });

  db.query(queryUpdateBudget, [totalTransactionAmount, budgetId], (err, result) => {
    if (err) {
      console.error('Erreur lors de la mise à jour du budget:', err);
      return res.status(500).json({ message: 'Erreur lors de la mise à jour du budget.', error: err });
    }
    console.log('Budget mis à jour avec succès:', result);
    res.status(201).json({ message: 'Transactions ajoutées et budget mis à jour avec succès.' });
  });
});

// Récupérer l'historique des transactions
app.get('/transactions', (req, res) => {
  if (!req.session.user) {
    console.warn('Utilisateur non authentifié');
    return res.status(401).json({ message: 'Utilisateur non authentifié.' });
  }

  console.log('Requête de récupération des transactions pour l\'utilisateur ID:', req.session.user.id);

  const query = `
    SELECT t.category, t.amount, t.comment, t.createdAt, b.category as budgetCategory
    FROM transactions t
    JOIN budgets b ON t.budgetId = b.id
    WHERE b.userId = ?
  `;
  
  db.query(query, [req.session.user.id], (err, results) => {
    if (err) {
      console.error('Erreur lors de la récupération des transactions:', err);
      return res.status(500).json({ message: 'Erreur lors de la récupération des transactions.', error: err });
    }
    console.log('Transactions récupérées:', results);
    res.status(200).json(results);
  });
});

// Ajouter une épargne à un budget
app.post('/savings', (req, res) => {
  const { budgetId, amount, date } = req.body;

  console.log('Requête d\'ajout d\'épargne pour le budget ID:', budgetId, { amount, date });

  const querySaving = 'INSERT INTO savings (amount, date, budgetId, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())';
  const queryUpdateBudget = 'UPDATE budgets SET amount = amount - ? WHERE id = ?';

  db.query(querySaving, [amount, date, budgetId], (err, result) => {
    if (err) {
      console.error('Erreur lors de l\'ajout de l\'épargne:', err);
      return res.status(500).json({ message: 'Erreur lors de l\'ajout de l\'épargne.', error: err });
    }
    console.log('Épargne ajoutée avec succès:', result.insertId);

    db.query(queryUpdateBudget, [amount, budgetId], (err, result) => {
      if (err) {
        console.error('Erreur lors de la mise à jour du budget:', err);
        return res.status(500).json({ message: 'Erreur lors de la mise à jour du budget.', error: err });
      }
      console.log('Budget mis à jour avec succès:', result);
      res.status(201).json({ message: 'Épargne ajoutée et budget mis à jour avec succès.' });
    });
  });
});

// Récupérer l'historique des épargnes
app.get('/savings', (req, res) => {
  if (!req.session.user) {
    console.warn('Utilisateur non authentifié');
    return res.status(401).json({ message: 'Utilisateur non authentifié.' });
  }

  console.log('Requête de récupération des épargnes pour l\'utilisateur ID:', req.session.user.id);

  const query = `
    SELECT s.amount, s.date, b.category as budgetCategory
    FROM savings s
    JOIN budgets b ON s.budgetId = b.id
    WHERE b.userId = ?
  `;
  
  db.query(query, [req.session.user.id], (err, results) => {
    if (err) {
      console.error('Erreur lors de la récupération des épargnes:', err);
      return res.status(500).json({ message: 'Erreur lors de la récupération des épargnes.', error: err });
    }
    console.log('Épargnes récupérées:', results);
    res.status(200).json(results);
  });
});

// Supprimer un budget
app.delete('/budgets/:budgetId', (req, res) => {
  const { budgetId } = req.params;

  // Commencer par supprimer les dépenses associées au budget
  const deleteExpensesQuery = 'DELETE FROM expenses WHERE budgetId = ?';
  db.query(deleteExpensesQuery, [budgetId], (err, result) => {
    if (err) {
      console.error('Erreur lors de la suppression des dépenses:', err);
      return res.status(500).json({ message: 'Erreur lors de la suppression des dépenses.', error: err });
    }

    // Supprimer les revenus associés au budget
    const deleteRevenuesQuery = 'DELETE FROM revenus WHERE budgetId = ?';
    db.query(deleteRevenuesQuery, [budgetId], (err, result) => {
      if (err) {
        console.error('Erreur lors de la suppression des revenus:', err);
        return res.status(500).json({ message: 'Erreur lors de la suppression des revenus.', error: err });
      }

      // Supprimer la période associée au budget
      const deletePeriodsQuery = 'DELETE FROM periods WHERE budgetId = ?';
      db.query(deletePeriodsQuery, [budgetId], (err, result) => {
        if (err) {
          console.error('Erreur lors de la suppression de la période:', err);
          return res.status(500).json({ message: 'Erreur lors de la suppression de la période.', error: err });
        }

        // Enfin, supprimer le budget lui-même
        const deleteBudgetQuery = 'DELETE FROM budgets WHERE id = ?';
        db.query(deleteBudgetQuery, [budgetId], (err, result) => {
          if (err) {
            console.error('Erreur lors de la suppression du budget:', err);
            return res.status(500).json({ message: 'Erreur lors de la suppression du budget.', error: err });
          }

          res.status(200).json({ message: 'Budget supprimé avec succès.' });
        });
      });
    });
  });
});

// API pour obtenir toutes les devises
app.get('/currencies', (req, res) => {
  const sql = 'SELECT * FROM currencies';
  db.query(sql, (err, results) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.json({ currencies: results });
  });
});

// API pour mettre à jour la devise active
app.post('/currencies/activate', (req, res) => {
  const { id } = req.body;
  db.query('UPDATE currencies SET is_active = 0', [], (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    db.query('UPDATE currencies SET is_active = 1 WHERE id = ?', [id], (err) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.json({ message: 'Devise activée avec succès' });
    });
  });
});

// API pour obtenir la devise active
app.get('/currencies/active', (req, res) => {
  const sql = 'SELECT * FROM currencies WHERE is_active = 1 LIMIT 1';
  db.query(sql, (err, results) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.json({ currency: results[0] });
  });
});

// Transporteur pour envoyer des e-mails
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Envoi du code de réinitialisation
app.post('/auth/send-reset-code', (req, res) => {
  const { email } = req.body;
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
  const resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  console.log('Envoi du code de réinitialisation:', { resetCode, resetCodeExpires, email });

  // Stocker le code et l'expiration dans la base de données
  const query = 'UPDATE users SET resetCode = ?, resetCodeExpires = ? WHERE email = ?';
  db.query(query, [resetCode, resetCodeExpires, email], (err, result) => {
    if (err) {
      console.error('Erreur lors de l\'enregistrement du code de réinitialisation:', err);
      return res.status(500).json({ message: 'Erreur lors de l\'enregistrement du code de réinitialisation.', error: err });
    }

    console.log('Code de réinitialisation enregistré:', result);

    // Envoyer le code par e-mail
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Réinitialisation du code de sécurité',
      text: `Votre code de réinitialisation est : ${resetCode}. Ce code expirera dans 15 minutes.`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Erreur lors de l\'envoi de l\'e-mail:', error);
        return res.status(500).json({ message: 'Erreur lors de l\'envoi de l\'e-mail.' });
      }
      console.log('E-mail envoyé:', info.response);
      res.status(200).json({ message: 'E-mail de réinitialisation envoyé.' });
    });
  });
});

// Vérification du code de réinitialisation
app.post('/auth/verify-reset-code', (req, res) => {
  const { resetCode, email } = req.body;
  console.log('Vérification du code de réinitialisation:', { resetCode, email });

  if (!resetCode || !email) {
    return res.status(400).json({ message: 'Code de réinitialisation ou email manquant.' });
  }

  const query = 'SELECT * FROM users WHERE resetCode = ? AND email = ? AND resetCodeExpires > NOW()';
  db.query(query, [resetCode, email], (err, results) => {
    if (err) {
      console.error('Erreur lors de la vérification du code de réinitialisation:', err);
      return res.status(500).json({ message: 'Erreur lors de la vérification du code de réinitialisation.', error: err });
    }

    console.log('Résultats de la vérification:', results);
    if (results.length > 0) {
      res.status(200).json({ isValid: true });
    } else {
      res.status(400).json({ isValid: false, message: 'Code de réinitialisation invalide ou expiré.' });
    }
  });
});


// Mettre à jour le code de sécurité
app.post('/auth/update-code', async (req, res) => {
  const { email, resetCode, newCode } = req.body;
  const query = 'SELECT * FROM users WHERE email = ? AND resetCode = ? AND resetCodeExpires > NOW()';
  db.query(query, [email, resetCode], async (err, results) => {
    if (err) {
      console.error('Erreur lors de la vérification du code de réinitialisation:', err);
      return res.status(500).json({ message: 'Erreur lors de la vérification du code de réinitialisation.', error: err });
    }

    if (results.length > 0) {
      const hashedNewCode = await bcrypt.hash(newCode, 10);
      const updateQuery = 'UPDATE users SET authCode = ?, resetCode = NULL, resetCodeExpires = NULL WHERE email = ?';
      db.query(updateQuery, [hashedNewCode, email], (err) => {
        if (err) {
          console.error('Erreur lors de la mise à jour du code de sécurité:', err);
          return res.status(500).json({ message: 'Erreur lors de la mise à jour du code de sécurité.', error: err });
        }
        res.status(200).json({ message: 'Code de sécurité mis à jour avec succès.' });
      });
    } else {
      res.status(400).json({ message: 'Code de réinitialisation invalide ou expiré.' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Le serveur fonctionne sur le port ${PORT}`);
});
