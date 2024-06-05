const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors({
  origin: 'http://192.168.1.114:3000', // Update with your frontend URL
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'wisenkap',
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    throw err;
  }
  console.log('MySQL Connected...');
});

// Test route
app.get('/test', (req, res) => {
  res.send('Server is running');
});

// Signup route
app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    console.error('Signup failed: Missing email or password');
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = { email, password: hashedPassword };

  const query = 'INSERT INTO users SET ?';
  db.query(query, newUser, (err, result) => {
    if (err) {
      console.error('Signup failed:', err);
      return res.status(500).json({ message: 'Erreur lors de la création de l\'utilisateur.', error: err });
    }
    console.log('User created:', result);
    res.status(201).json({ message: 'Utilisateur créé avec succès.' });
  });
});

// Login route
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    console.error('Login failed: Missing email or password');
    return res.status(400).json({ message: 'Tous les champs sont requis.' });
  }

  const query = 'SELECT * FROM users WHERE email = ?';
  db.query(query, [email], async (err, results) => {
    if (err) {
      console.error('Login failed:', err);
      return res.status(500).json({ message: 'Erreur du serveur.', error: err });
    }

    if (results.length === 0) {
      console.warn('Login failed: User not found');
      return res.status(404).json({ message: 'Utilisateur non trouvé. Voulez-vous créer un compte ?' });
    }

    const user = results[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.warn('Login failed: Incorrect password');
      return res.status(400).json({ message: 'Mot de passe incorrect.' });
    }

    // Store user info in session
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

    console.log('Login successful:', req.session.user);
    res.status(200).json({ message: 'Connexion réussie.', user: req.session.user });
  });
});

app.get('/auth/user', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'User not authenticated.' });
  }
  
  const query = 'SELECT email, phone, firstName, gender, dob, country, postalCode FROM users WHERE id = ?';
  db.query(query, [req.session.user.id], (err, results) => {
    if (err) {
      console.error('Error fetching user data:', err);
      return res.status(500).json({ message: 'Error fetching user data.', error: err });
    }
    res.status(200).json(results[0]);
  });
});

// Update user details
app.put('/auth/user', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'User not authenticated.' });
  }

  const { phone, firstName, gender, dob, country, postalCode } = req.body;
  const query = 'UPDATE users SET phone = ?, firstName = ?, gender = ?, dob = ?, country = ?, postalCode = ? WHERE id = ?';

  db.query(query, [phone, firstName, gender, dob, country, postalCode, req.session.user.id], (err, result) => {
    if (err) {
      console.error('Error updating user data:', err);
      return res.status(500).json({ message: 'Error updating user data.', error: err });
    }
    res.status(200).json({ message: 'User details updated successfully.' });
  });
});


// Add a new route to get all users
app.get('/users', (req, res) => {
  const query = 'SELECT id, email, phone, firstName, gender, dob, country, postalCode FROM users';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ message: 'Error fetching users.', error: err });
    }
    res.status(200).json(results);
  });
});


// Logout route
app.post('/auth/logout', (req, res) => {
  if (req.session.user) {
    console.log('Logging out user:', req.session.user.email);
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).json({ message: 'Erreur lors de la déconnexion.' });
      }
      res.status(200).json({ message: 'Déconnexion réussie.' });
    });
  } else {
    console.warn('Logout failed: No user in session');
    return res.status(400).json({ message: 'Vous n\'êtes pas connecté.' });
  }
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

