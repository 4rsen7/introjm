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
    console.log('Registering user:', email);

    try {
        // 1. Sign up user via Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) throw authError;

        // 2. Create profile in 'profiles' table
        if (authData.user) {
            const fullName = `${firstName || ''} ${lastName || ''}`.trim();
            
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
    console.log('Logging in user:', email);

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

// Journeys Routes

// GET /api/journeys
app.get('/api/journeys', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        // 1. Get user's workspace
        const { data: workspaces, error: wsError } = await supabase
            .from('workspaces')
            .select('id')
            .eq('owner_id', user.id);

        if (wsError) throw wsError;

        // If no workspace, return empty list
        if (!workspaces || workspaces.length === 0) {
            console.warn(`[GET /journeys] No workspace found for user ${user.id}. This usually means RLS is hiding it (wrong API key) or it doesn't exist.`);
            return res.json({ status: 'success', data: [] });
        }

        const workspaceIds = workspaces.map(ws => ws.id);

        // 2. Get journeys
        const { data: journeys, error: journeyError } = await supabase
            .from('journeys')
            .select('*')
            .in('workspace_id', workspaceIds)
            .order('created_at', { ascending: false });

        if (journeyError) throw journeyError;

        res.json({ status: 'success', data: journeys });
    } catch (error) {
        console.error('Error fetching journeys:', error);
        res.status(400).json({ status: 'error', error: error.message });
    }
});

// GET /api/journeys/:id
app.get('/api/journeys/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        const { data: journey, error } = await supabase
            .from('journeys')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        res.json({ status: 'success', data: journey });
    } catch (error) {
        console.error('Error fetching journey:', error);
        res.status(400).json({ status: 'error', error: error.message });
    }
});

// PUT /api/journeys/:id
app.put('/api/journeys/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;
    const { title, description, status, map_data } = req.body;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        const updates = {
            updated_at: new Date()
        };
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (status !== undefined) updates.status = status;
        if (map_data !== undefined) updates.map_data = map_data;

        const { data: journey, error } = await supabase
            .from('journeys')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ status: 'success', data: journey });
    } catch (error) {
        console.error('Error updating journey:', error);
        res.status(400).json({ status: 'error', error: error.message });
    }
});

// POST /api/journeys
app.post('/api/journeys', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { title, description } = req.body;
    
    console.log('POST /api/journeys - Request received');

    if (!token) {
        console.error('No token provided');
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            console.error('Auth error:', authError);
            throw new Error('Invalid token');
        }
        
        console.log('User authenticated:', user.id);

        // 1. Find or create workspace
        let { data: workspace, error: wsError } = await supabase
            .from('workspaces')
            .select('id')
            .eq('owner_id', user.id)
            .limit(1)
            .maybeSingle();

        if (wsError) {
            console.error('Error finding workspace:', wsError);
            throw wsError;
        }

        if (!workspace) {
            console.log('Workspace not found, creating new one...');
            const { data: newWorkspace, error: createWsError } = await supabase
                .from('workspaces')
                .insert([{ owner_id: user.id, name: 'My Workspace' }])
                .select()
                .single();
            
            if (createWsError) {
                console.error('Error creating workspace:', createWsError);
                if (createWsError.code === '42501' || createWsError.message?.includes('row-level security')) {
                    throw new Error('RLS Policy Violation: Check if SUPABASE_SERVICE_KEY in .env is the Service Role key (starts with eyJ...).');
                }
                throw createWsError;
            }
            workspace = newWorkspace;
            console.log('Workspace created:', workspace.id);
        }

        // 2. Create Journey
        console.log('Creating journey in workspace:', workspace.id);
        const { data: journey, error: insertError } = await supabase
            .from('journeys')
            .insert([{
                title,
                description,
                workspace_id: workspace.id,
                status: 'draft',
                updated_at: new Date(),
                user_id: user.id
            }])
            .select()
            .single();

        if (insertError) {
            console.error('Error inserting journey:', insertError);
            throw insertError;
        }

        console.log('Journey created successfully:', journey.id);
        res.status(201).json({ status: 'success', data: journey });
    } catch (error) {
        console.error('Error in POST /api/journeys:', error);
        res.status(400).json({ status: 'error', error: error.message });
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