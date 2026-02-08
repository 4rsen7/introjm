const express = require('express');
const cors = require('cors');
require('dotenv').config();
const supabase = require('./supabaseClient');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: 'http://localhost:5173', // Дозволяємо запити з клієнта
    credentials: true
}));
app.use(express.json());

// Auth Routes

// Register Route
app.post('/api/register', async (req, res) => {
    const { email, password, firstName, lastName } = req.body;

    try {
        // 1. Sign up user via Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) throw authError;

        // 2. Create profile in 'profiles' table
        if (authData.user) {
            const fullName = `${firstName} ${lastName}`.trim();
            
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([
                    { id: authData.user.id, full_name: fullName }
                ]);

            if (profileError) throw profileError;
        }

        res.status(201).json({ status: 'success', message: 'User registered successfully', user: authData.user });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ status: 'error', error: error.message });
    }
});

// Login Route
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;

        res.json({ status: 'success', message: 'Logged in successfully', session: data.session, user: data.user });
    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ status: 'error', error: error.message });
    }
});

// Test Route
app.get('/api/test-db', async (req, res) => {
    try {
        // Робимо простий запит до таблиці journeys (рахуємо кількість записів)
        const { count, error } = await supabase
            .from('journeys')
            .select('*', { count: 'exact', head: true });

        if (error) throw error;

        res.json({ status: 'success', message: 'Connected to Supabase successfully!', journeysCount: count });
    } catch (error) {
        console.error('Supabase connection error:', error);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});