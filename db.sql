-- Create database
CREATE DATABASE IF NOT EXISTS moodjar;
USE moodjar;

-- Users table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mood entries table
CREATE TABLE moods (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    mood VARCHAR(50) NOT NULL,
    emoji VARCHAR(10) NOT NULL,
    note TEXT,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_logged_at (logged_at)
);

-- Saved verses table
CREATE TABLE saved_verses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    arabic VARCHAR(500) NOT NULL,
    translation TEXT NOT NULL,
    reference VARCHAR(200) NOT NULL,
    mood VARCHAR(50),
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
);

-- Sample data (optional)
INSERT INTO users (username, email, password_hash) VALUES 
('demo', 'demo@example.com', '$2b$10$DemoHashHere');