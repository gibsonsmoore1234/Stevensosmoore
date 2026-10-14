const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Setup uploads folder
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'data', 'art_portfolio.db'), (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Create data directory if it doesn't exist
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Admin table
  db.run(`CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`, (err) => {
    if (err) console.error('Error creating admin table:', err);
  });

  // Artworks table
  db.run(`CREATE TABLE IF NOT EXISTS artworks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    price REAL,
    image_path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    available BOOLEAN DEFAULT 1
  )`, (err) => {
    if (err) console.error('Error creating artworks table:', err);
  });

  // Check if default admin exists, create if not
  db.get("SELECT * FROM admin WHERE username = ?", ['admin'], (err, row) => {
    if (!row) {
      const hashedPassword = bcrypt.hashSync('password123', 10);
      db.run("INSERT INTO admin (username, password) VALUES (?, ?)",
        ['admin', hashedPassword],
        (err) => {
          if (err) console.error('Error creating default admin:', err);
          else console.log('Default admin created (username: admin, password: password123)');
        }
      );
    }
  });
}

// Middleware to verify JWT token
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
}

// Auth Routes
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM admin WHERE username = ?", [username], (err, admin) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({ token, message: 'Login successful' });
  });
});

app.post('/api/auth/change-password', verifyToken, (req, res) => {
  const { oldPassword, newPassword } = req.body;

  db.get("SELECT * FROM admin WHERE id = ?", [req.admin.id], (err, admin) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    if (!bcrypt.compareSync(oldPassword, admin.password)) {
      return res.status(401).json({ message: 'Old password is incorrect' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.run("UPDATE admin SET password = ? WHERE id = ?",
      [hashedPassword, req.admin.id],
      (err) => {
        if (err) {
          return res.status(500).json({ message: 'Error updating password' });
        }
        res.json({ message: 'Password changed successfully' });
      }
    );
  });
});

// Artwork Routes
app.get('/api/artworks', (req, res) => {
  const category = req.query.category;
  let query = 'SELECT * FROM artworks WHERE available = 1';
  const params = [];

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    res.json(rows);
  });
});

app.get('/api/artworks/:id', (req, res) => {
  db.get("SELECT * FROM artworks WHERE id = ? AND available = 1", [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ message: 'Artwork not found' });
    }
    res.json(row);
  });
});

app.post('/api/artworks', verifyToken, upload.single('image'), (req, res) => {
  const { title, description, category, price } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: 'No image uploaded' });
  }

  const imagePath = `/uploads/${req.file.filename}`;

  db.run(
    "INSERT INTO artworks (title, description, category, price, image_path) VALUES (?, ?, ?, ?, ?)",
    [title, description, category, price || 0, imagePath],
    function(err) {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }
      res.json({
        message: 'Artwork added successfully',
        id: this.lastID,
        artwork: {
          id: this.lastID,
          title,
          description,
          category,
          price,
          image_path: imagePath
        }
      });
    }
  );
});

app.put('/api/artworks/:id', verifyToken, upload.single('image'), (req, res) => {
  const { title, description, category, price } = req.body;
  const updates = [];
  const values = [];

  if (title) {
    updates.push('title = ?');
    values.push(title);
  }
  if (description) {
    updates.push('description = ?');
    values.push(description);
  }
  if (category) {
    updates.push('category = ?');
    values.push(category);
  }
  if (price !== undefined) {
    updates.push('price = ?');
    values.push(price);
  }
  if (req.file) {
    updates.push('image_path = ?');
    values.push(`/uploads/${req.file.filename}`);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  values.push(req.params.id);

  db.run(
    `UPDATE artworks SET ${updates.join(', ')} WHERE id = ?`,
    values,
    (err) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }
      res.json({ message: 'Artwork updated successfully' });
    }
  );
});

app.delete('/api/artworks/:id', verifyToken, (req, res) => {
  db.run("UPDATE artworks SET available = 0 WHERE id = ?", [req.params.id], (err) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    res.json({ message: 'Artwork deleted successfully' });
  });
});

app.get('/api/admin/artworks', verifyToken, (req, res) => {
  db.all('SELECT * FROM artworks ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ message: 'Database error' });
    }
    res.json(rows);
  });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
