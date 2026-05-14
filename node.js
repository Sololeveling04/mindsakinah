const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // Serve your HTML files

// Database connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',        // Your MySQL username
    password: '',        // Your MySQL password
    database: 'moodjar',
    waitForConnections: true,
    connectionLimit: 10
});

const JWT_SECRET = 'moodjar-secret-key-change-this-in-production';

// Test database connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ MySQL connected successfully');
        connection.release();
    } catch (error) {
        console.error('❌ MySQL connection failed:', error.message);
    }
}
testConnection();

// Middleware to verify JWT
async function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// ========== AUTH ENDPOINTS ==========

// Register
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        
        const token = jwt.sign({ userId: result.insertId }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ 
            success: true,
            token, 
            user: { id: result.insertId, username, email } 
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'Email already exists' });
        } else {
            console.error(error);
            res.status(500).json({ error: 'Registration failed' });
        }
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ 
            success: true,
            token, 
            user: { id: user.id, username: user.username, email: user.email } 
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// ========== MOOD ENDPOINTS ==========

// Save mood entry
app.post('/api/moods', authenticate, async (req, res) => {
    const { mood, emoji, note } = req.body;
    
    try {
        const [result] = await pool.execute(
            'INSERT INTO moods (user_id, mood, emoji, note) VALUES (?, ?, ?, ?)',
            [req.userId, mood, emoji, note || '']
        );
        
        res.json({ 
            success: true,
            id: result.insertId, 
            message: 'Mood saved successfully' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save mood' });
    }
});

// Get today's mood
app.get('/api/moods/today', authenticate, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT * FROM moods 
             WHERE user_id = ? AND DATE(logged_at) = CURDATE() 
             ORDER BY logged_at DESC LIMIT 1`,
            [req.userId]
        );
        
        res.json(rows[0] || null);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch today\'s mood' });
    }
});

// Get all moods (with pagination)
app.get('/api/moods', authenticate, async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    try {
        const [rows] = await pool.execute(
            `SELECT * FROM moods 
             WHERE user_id = ? 
             ORDER BY logged_at DESC 
             LIMIT ? OFFSET ?`,
            [req.userId, limit, offset]
        );
        
        const [countResult] = await pool.execute(
            'SELECT COUNT(*) as total FROM moods WHERE user_id = ?',
            [req.userId]
        );
        
        res.json({
            moods: rows,
            pagination: {
                page,
                limit,
                total: countResult[0].total,
                pages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch moods' });
    }
});

// Get mood stats
app.get('/api/moods/stats', authenticate, async (req, res) => {
    try {
        const [totalResult] = await pool.execute(
            'SELECT COUNT(*) as total FROM moods WHERE user_id = ?',
            [req.userId]
        );
        
        const [topMoodResult] = await pool.execute(
            `SELECT mood, COUNT(*) as count 
             FROM moods 
             WHERE user_id = ? 
             GROUP BY mood 
             ORDER BY count DESC 
             LIMIT 1`,
            [req.userId]
        );
        
        const [weeklyResult] = await pool.execute(
            `SELECT 
                DATE(logged_at) as date,
                mood,
                emoji
             FROM moods 
             WHERE user_id = ? 
               AND logged_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
             ORDER BY logged_at DESC`,
            [req.userId]
        );
        
        res.json({
            total: totalResult[0].total,
            topMood: topMoodResult[0] || null,
            weekly: weeklyResult
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ========== SAVED VERSES ENDPOINTS ==========

// Save a verse
app.post('/api/saved-verses', authenticate, async (req, res) => {
    const { arabic, translation, reference, mood } = req.body;
    
    try {
        const [result] = await pool.execute(
            'INSERT INTO saved_verses (user_id, arabic, translation, reference, mood) VALUES (?, ?, ?, ?, ?)',
            [req.userId, arabic, translation, reference, mood]
        );
        
        res.json({ 
            success: true,
            id: result.insertId, 
            message: 'Verse saved successfully' 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save verse' });
    }
});

// Get saved verses
app.get('/api/saved-verses', authenticate, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT * FROM saved_verses WHERE user_id = ? ORDER BY saved_at DESC',
            [req.userId]
        );
        
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch saved verses' });
    }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});sss