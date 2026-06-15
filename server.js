const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Database connection for PostgreSQL (Supabase) - FIXED SSL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { 
        rejectUnauthorized: false,
        require: true
    },
    connectionTimeoutMillis: 10000,
    keepAlive: true
});

const JWT_SECRET = process.env.JWT_SECRET || 'moodjar-secret-key-2024';

// Test connection
async function testConnection() {
    try {
        const client = await pool.connect();
        console.log('✅ PostgreSQL connected successfully');
        client.release();
    } catch (error) {
        console.error('❌ PostgreSQL connection failed:', error.message);
    }
}
testConnection();

// Register endpoint
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
            [username, email, hashedPassword]
        );
        
        const userId = result.rows[0].id;
        const token = jwt.sign({ userId: userId }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ 
            success: true,
            token, 
            user: { id: userId, username, email } 
        });
    } catch (error) {
        if (error.code === '23505') {
            res.status(400).json({ error: 'Email already exists' });
        } else {
            console.error(error);
            res.status(500).json({ error: 'Registration failed' });
        }
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
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
        console.error(error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Middleware to verify token
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

// Save mood
app.post('/api/moods', authenticate, async (req, res) => {
    const { mood, emoji, note } = req.body;
    
    try {
        const result = await pool.query(
            'INSERT INTO moods (user_id, mood, emoji, note) VALUES ($1, $2, $3, $4) RETURNING id',
            [req.userId, mood, emoji, note || '']
        );
        
        res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save mood' });
    }
});

// Get today's mood
app.get('/api/moods/today', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM moods 
             WHERE user_id = $1 AND DATE(logged_at) = CURRENT_DATE 
             ORDER BY logged_at DESC LIMIT 1`,
            [req.userId]
        );
        res.json(result.rows[0] || null);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch today\'s mood' });
    }
});

// Get all moods
app.get('/api/moods', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM moods WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50`,
            [req.userId]
        );
        res.json({ moods: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch moods' });
    }
});

// Get stats
app.get('/api/moods/stats', authenticate, async (req, res) => {
    try {
        const totalResult = await pool.query(
            'SELECT COUNT(*) as total FROM moods WHERE user_id = $1',
            [req.userId]
        );
        
        const topMoodResult = await pool.query(
            `SELECT mood, COUNT(*) as count 
             FROM moods WHERE user_id = $1 
             GROUP BY mood ORDER BY count DESC LIMIT 1`,
            [req.userId]
        );
        
        res.json({
            total: parseInt(totalResult.rows[0].total),
            topMood: topMoodResult.rows[0] || null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Get mood trends
app.get('/api/moods/trends', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                DATE(logged_at) as date,
                mood,
                emoji,
                logged_at
             FROM moods 
             WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '30 days'
             ORDER BY logged_at ASC`,
            [req.userId]
        );
        
        const moodValues = {
            'Sad': 1,
            'Stressed': 2,
            'Neutral': 3,
            'Happy': 4,
            'Very Happy': 5
        };
        
        const trends = result.rows.map(row => ({
            date: row.date,
            mood: row.mood,
            emoji: row.emoji,
            value: moodValues[row.mood] || 3
        }));
        
        res.json(trends);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch trends' });
    }
});

// Save verse
app.post('/api/saved-verses', authenticate, async (req, res) => {
    const { arabic, translation, reference, mood, surah_number, ayah_number, audioUrl } = req.body;
    
    try {
        await pool.query(
            `INSERT INTO saved_verses (user_id, arabic, translation, reference, mood, surah_number, ayah_number, audio_url) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [req.userId, arabic, translation, reference, mood, surah_number || null, ayah_number || null, audioUrl || null]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving verse:', error);
        res.status(500).json({ error: 'Failed to save verse' });
    }
});

// Get saved verses
app.get('/api/saved-verses', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM saved_verses WHERE user_id = $1 ORDER BY saved_at DESC',
            [req.userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch saved verses' });
    }
});

// Save mood with tags
app.post('/api/moods/with-tags', authenticate, async (req, res) => {
    const { mood, emoji, note, tags } = req.body;
    
    try {
        const result = await pool.query(
            'INSERT INTO moods (user_id, mood, emoji, note, tags) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [req.userId, mood, emoji, note || '', JSON.stringify(tags || [])]
        );
        
        res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error('Error saving mood:', error);
        res.status(500).json({ error: 'Failed to save mood' });
    }
});

// Prayer times endpoint
app.get('/api/prayer-times', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT latitude, longitude, city FROM user_settings WHERE user_id = $1',
            [req.userId]
        );
        
        if (result.rows.length === 0 || !result.rows[0].latitude) {
            return res.json(null);
        }
        
        const { latitude, longitude } = result.rows[0];
        const response = await fetch(`https://api.aladhan.com/v1/timings/${Math.floor(Date.now() / 1000)}?latitude=${latitude}&longitude=${longitude}&method=2`);
        const data = await response.json();
        
        res.json({
            city: result.rows[0].city,
            timings: data.data.timings
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch prayer times' });
    }
});

// Save prayer location
app.post('/api/user/prayer-location', authenticate, async (req, res) => {
    const { latitude, longitude, city } = req.body;
    
    try {
        await pool.query(
            `INSERT INTO user_settings (user_id, latitude, longitude, city) 
             VALUES ($1, $2, $3, $4) 
             ON CONFLICT (user_id) DO UPDATE SET latitude = $2, longitude = $3, city = $4`,
            [req.userId, latitude, longitude, city]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save location' });
    }
});

// User reminder
app.post('/api/user/reminder', authenticate, async (req, res) => {
    const { reminderTime } = req.body;
    
    try {
        await pool.query(
            `INSERT INTO user_settings (user_id, reminder_time) 
             VALUES ($1, $2) 
             ON CONFLICT (user_id) DO UPDATE SET reminder_time = $2`,
            [req.userId, reminderTime]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save reminder' });
    }
});

app.get('/api/user/reminder', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT reminder_time FROM user_settings WHERE user_id = $1',
            [req.userId]
        );
        res.json(result.rows[0] || null);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reminder' });
    }
});

// User profile endpoints
app.get('/api/user/profile', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, created_at FROM users WHERE id = $1',
            [req.userId]
        );
        res.json(result.rows[0] || null);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

app.put('/api/user/profile', authenticate, async (req, res) => {
    const { username } = req.body;
    
    try {
        await pool.query(
            'UPDATE users SET username = $1 WHERE id = $2',
            [username, req.userId]
        );
        res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Export moods as CSV
app.get('/api/moods/export', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT mood, emoji, note, logged_at, tags FROM moods WHERE user_id = $1 ORDER BY logged_at DESC',
            [req.userId]
        );
        
        let csv = 'Date,Mood,Emoji,Note,Tags\n';
        result.rows.forEach(row => {
            csv += `${row.logged_at},${row.mood},${row.emoji},"${row.note || ''}",${row.tags}\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=mood-journal.csv');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ error: 'Failed to export data' });
    }
});

// Create user_settings table if not exists (run this once)
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                reminder_time VARCHAR(10),
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                city VARCHAR(100),
                dark_mode BOOLEAN DEFAULT FALSE
            )
        `);
        console.log('✅ Database tables verified');
    } catch (error) {
        console.error('❌ Database init error:', error.message);
    }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    await initDatabase();
    console.log(`\n🚀 Server running!`);
    console.log(`📍 Open: http://localhost:${PORT}`);
    console.log(`\n⚠️  Don't close this terminal window!\n`);
});