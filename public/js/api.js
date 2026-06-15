const API_URL = 'http://localhost:3000/api';

let authToken = null;

export const api = {
    setToken(token) {
        authToken = token;
        localStorage.setItem('authToken', token);
    },
    
    getToken() {
        return authToken || localStorage.getItem('authToken');
    },
    
    clearToken() {
        authToken = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
    },
    
    async request(endpoint, options = {}) {
        const token = this.getToken();
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` }),
                ...options.headers
            }
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Request failed');
        return data;
    },
    
    async register(username, email, password) {
        const data = await this.request('/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });
        if (data.token) this.setToken(data.token);
        return data;
    },
    
    async login(email, password) {
        const data = await this.request('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        if (data.token) this.setToken(data.token);
        return data;
    },
    
    async saveMood(mood, emoji, note) {
        return this.request('/moods', {
            method: 'POST',
            body: JSON.stringify({ mood, emoji, note })
        });
    },
    
    async getTodayMood() {
        return this.request('/moods/today');
    },
    
    async getMoods() {
        return this.request('/moods');
    },
    
    async getStats() {
        return this.request('/moods/stats');
    },
    
    async saveVerse(arabic, translation, reference, mood) {
        return this.request('/saved-verses', {
            method: 'POST',
            body: JSON.stringify({ arabic, translation, reference, mood })
        });
    },
    
    async getSavedVerses() {
        return this.request('/saved-verses');
    }
};