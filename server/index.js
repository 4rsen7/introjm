const express = require('express');
const cors = require('cors');
require('dotenv').config();
const supabase = require('./supabaseClient');

const app = express();
const PORT = process.env.PORT || 5000;

// GLOBAL LOGGER: Log every single request hitting the server
app.use((req, res, next) => {
    console.log(`📡 [INCOMING] ${req.method} ${req.url}`);
    next();
});

// Initialize Storage Bucket
(async () => {
    try {
        const { data: buckets, error } = await supabase.storage.listBuckets();
        if (error) console.error('Error listing buckets:', error);
        
        if (buckets && !buckets.find(b => b.name === 'journey_images')) {
            console.log('Creating "journey_images" bucket...');
            await supabase.storage.createBucket('journey_images', {
                public: true,
                fileSizeLimit: 2097152, // 2MB limit enforced by Supabase
                allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
            });
        }
    } catch (e) {
        console.error('Storage init error:', e);
    }
})();

// Middleware
app.use(cors({
    origin: 'http://localhost:5173', // Дозволяємо запити з клієнта
    credentials: true
}));
app.use(express.json());

// --- SYSTEM LOGGING HELPER ---
async function logSystemError(error, context = '') {
    try {
        await supabase.from('system_logs').insert([{
            level: 'error',
            message: error.message || 'Unknown error',
            details: { stack: error.stack, context }
        }]);
    } catch (e) {
        console.error('Failed to log system error to DB:', e);
    }
}

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

        // 3. Check for pending invites and add to workspace
        const { data: invites } = await supabase
            .from('workspace_invites')
            .select('*')
            .eq('email', email)
            .eq('status', 'pending');

        if (invites && invites.length > 0) {
            for (const invite of invites) {
                await supabase.from('workspace_members').insert({ workspace_id: invite.workspace_id, user_id: authData.user.id, role: invite.role });
                await supabase.from('workspace_invites').update({ status: 'accepted' }).eq('id', invite.id);
            }
        }

        res.status(201).json({ status: 'success', message: 'User registered successfully', user: authData.user });
    } catch (error) {
        console.error('Registration error:', error);
        logSystemError(error, 'POST /api/register'); // Log to DB
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
        logSystemError(error, 'POST /api/login'); // Log to DB
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
        if (authError || !user) {
            return res.status(401).json({ status: 'error', message: 'Invalid token' });
        }

        // 1. Get user's workspaces (Owned + Member)
        const { data: ownedWorkspaces } = await supabase
            .from('workspaces')
            .select('id')
            .eq('owner_id', user.id);

        const { data: memberWorkspaces } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', user.id);

        let workspaceIds = [
            ...(ownedWorkspaces || []).map(w => w.id),
            ...(memberWorkspaces || []).map(w => w.workspace_id)
        ];

        // If no workspace at all, create default one (Auto-Fix for new owners)
        if (workspaceIds.length === 0) {
            console.log(`[Auto-Fix] Creating default workspace for user ${user.id}`);
            const { data: newWorkspace, error: createWsError } = await supabase
                .from('workspaces')
                .insert([{ owner_id: user.id, name: 'My Workspace' }])
                .select()
                .single();
            
            if (createWsError) {
                console.error('Error creating default workspace:', createWsError);
                return res.json({ status: 'success', data: [] });
            }
            workspaceIds = [newWorkspace.id];
        }

        // 2. Get journeys from ALL accessible workspaces
        const { data: journeys, error: journeyError } = await supabase
            .from('journeys')
            .select('*')
            .in('workspace_id', workspaceIds)
            .order('created_at', { ascending: false });

        if (journeyError) throw journeyError;

        // Fetch profiles to map owner names
        const userIds = [...new Set(journeys.map(j => j.user_id).filter(Boolean))];
        let profilesMap = {};
        
        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .in('id', userIds);
                
            if (profiles) {
                profiles.forEach(p => {
                    profilesMap[p.id] = p.full_name || p.email;
                });
            }
        }

        const journeysWithOwners = journeys.map(j => ({
            ...j,
            owner: profilesMap[j.user_id] || 'Unknown'
        }));

        res.json({ status: 'success', data: journeysWithOwners });
    } catch (error) {
        console.error('Error fetching journeys:', error);
        logSystemError(error, 'GET /api/journeys'); // Log to DB
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// GET /api/journeys/:id
app.get('/api/journeys/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ status: 'error', message: 'Invalid token' });
        }

        const { data: journey, error } = await supabase
            .from('journeys')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // Fetch owner name
        let ownerName = '';
        if (journey.user_id) {
             const { data: profile } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', journey.user_id)
                .maybeSingle();
             ownerName = profile ? (profile.full_name || profile.email) : '';
        }

        res.json({ status: 'success', data: { ...journey, owner: ownerName } });
    } catch (error) {
        console.error('Error fetching journey:', error);
        logSystemError(error, `GET /api/journeys/${id}`);
        res.status(500).json({ status: 'error', error: error.message });
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
        if (authError || !user) {
            return res.status(401).json({ status: 'error', message: 'Invalid token' });
        }

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
        logSystemError(error, `PUT /api/journeys/${id}`);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// DELETE /api/journeys/:id
app.delete('/api/journeys/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        const { error } = await supabase
            .from('journeys')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ status: 'success', message: 'Journey deleted successfully' });
    } catch (error) {
        console.error('Error deleting journey:', error);
        logSystemError(error, `DELETE /api/journeys/${id}`);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// POST /api/journeys/:id/duplicate
app.post('/api/journeys/:id/duplicate', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        // 1. Get original journey
        const { data: original, error: fetchError } = await supabase
            .from('journeys')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        // 2. Prepare new journey data (exclude system fields)
        const { id: oldId, created_at, updated_at, ...journeyData } = original;
        
        const newJourney = {
            ...journeyData,
            title: `Copy of ${original.title}`,
            status: 'draft',
            updated_at: new Date(),
            user_id: user.id 
        };

        // 3. Insert new journey
        const { data: duplicated, error: insertError } = await supabase
            .from('journeys')
            .insert([newJourney])
            .select()
            .single();

        if (insertError) throw insertError;

        res.status(201).json({ status: 'success', data: duplicated });
    } catch (error) {
        console.error('Error duplicating journey:', error);
        logSystemError(error, `POST /api/journeys/${id}/duplicate`);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// PUT /api/journeys/:id/archive
app.put('/api/journeys/:id/archive', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        const { data: journey, error } = await supabase
            .from('journeys')
            .update({ status: 'archived', updated_at: new Date() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ status: 'success', data: journey });
    } catch (error) {
        console.error('Error archiving journey:', error);
        logSystemError(error, `PUT /api/journeys/${id}/archive`);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// PUT /api/journeys/:id/restore
app.put('/api/journeys/:id/restore', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            console.error('❌ [RESTORE] Auth error:', authError);
            throw new Error('Invalid token');
        }

        console.log(`[RESTORE] Request for journey ${id} by user ${user.id}`);

        // 1. Check ownership via Workspace OR user_id to handle legacy data
        const { data: workspaces } = await supabase
            .from('workspaces')
            .select('id')
            .eq('owner_id', user.id);
            
        const workspaceIds = workspaces ? workspaces.map(ws => ws.id) : [];

        // Fetch journey to verify access
        const { data: existingJourney, error: findError } = await supabase
            .from('journeys')
            .select('id, user_id, workspace_id')
            .eq('id', id)
            .single();

        if (findError || !existingJourney) throw new Error('Journey not found');

        // Verify access: Owner OR Workspace Owner
        const isOwner = existingJourney.user_id === user.id;
        const isWorkspaceOwner = workspaceIds.includes(existingJourney.workspace_id);

        if (!isOwner && !isWorkspaceOwner) {
            throw new Error('Unauthorized: You do not have permission to restore this journey');
        }

        // 2. Perform Update (Restore to 'draft')
        console.log(`[RESTORE] Executing UPDATE for ID: ${id}`);
        
        const { data, error: updateError } = await supabase
            .from('journeys')
            .update({ status: 'draft', updated_at: new Date().toISOString() })
            .eq('id', id)
            .select();

        if (updateError) {
            console.error('❌ [RESTORE] Database Update failed:', updateError);
            throw updateError;
        }

        if (!data || data.length === 0) {
            console.error('❌ [RESTORE] Update returned 0 rows! This usually means RLS blocked the update or ID is wrong.');
            // Check if row exists at all
            const { data: check } = await supabase.from('journeys').select('id, status').eq('id', id);
            console.log('[RESTORE] Debug - Does row exist?', check);
            
            throw new Error('Update failed - no rows affected (RLS or missing ID)');
        }

        console.log('✅ [RESTORE] Success! New status:', data[0].status);
        res.json({ status: 'success', data: data[0] });
    } catch (error) {
        console.error('❌ [RESTORE] Final Error:', error.message);
        logSystemError(error, `PUT /api/journeys/${id}/restore`);
        res.status(500).json({ status: 'error', error: error.message });
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
        
        // Get owner name for response
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .single();
            
        const ownerName = profile ? (profile.full_name || profile.email) : 'You';

        res.status(201).json({ status: 'success', data: { ...journey, owner: ownerName } });
    } catch (error) {
        console.error('Error in POST /api/journeys:', error);
        logSystemError(error, 'POST /api/journeys');
        res.status(500).json({ status: 'error', error: error.message });
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
        logSystemError(error, 'GET /api/test-db');
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// --- РОУТИ ДЛЯ ПЕРСОН (PERSONAS) ---

// 1. Отримати всі персони
app.get('/api/personas', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    // 1. Get accessible workspaces
    const { data: ownedWorkspaces } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', user.id);

    const { data: memberWorkspaces } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id);

    const workspaceIds = [
        ...(ownedWorkspaces || []).map(w => w.id),
        ...(memberWorkspaces || []).map(w => w.workspace_id)
    ];

    let query = supabase.from('personas').select('*');

    // Filter by workspace IDs
    if (workspaceIds.length > 0) {
        query = query.in('workspace_id', workspaceIds);
    } else {
        query = query.eq('user_id', user.id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch profiles to map owner names
    const userIds = [...new Set(data.map(p => p.user_id).filter(Boolean))];
    let profilesMap = {};
    
    if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
        if (profiles) profiles.forEach(p => { profilesMap[p.id] = p.full_name || p.email; });
    }

    const personasWithOwners = data.map(p => ({ ...p, owner: profilesMap[p.user_id] || 'Unknown' }));
    res.json({ status: 'success', data: personasWithOwners });
  } catch (err) {
    console.error('Error fetching personas:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Створити нову персону
app.post('/api/personas', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { name, role, description, image, goals, frustrations, motivations, painPoints, bio, age, location } = req.body;
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    // 1. Знаходимо робочий простір (Workspace)
    let { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle();

    // Якщо робочого простору немає - створюємо (fallback)
    if (!workspace) {
        const { data: newWorkspace, error: createWsError } = await supabase
            .from('workspaces')
            .insert([{ owner_id: user.id, name: 'My Workspace' }])
            .select()
            .single();
        
        if (createWsError) throw createWsError;
        workspace = newWorkspace;
    }

    const { data, error } = await supabase
      .from('personas')
      .insert([{ 
        name, 
        role, 
        description, 
        image,
        goals,
        frustrations,
        motivations,
        pain_points: painPoints,
        bio,
        age,
        location,
        user_id: user.id, // Беремо ID з токена для безпеки
        workspace_id: workspace.id, // Додаємо ID робочого простору
        status: 'active',
        updated_at: new Date()
      }])
      .select()
      .single();

    if (error) throw error;

    // Get owner name for response
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();
        
    const ownerName = profile ? (profile.full_name || profile.email) : 'You';
    res.json({ status: 'success', data: { ...data, owner: ownerName } });
  } catch (err) {
    console.error('Error creating persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Видалити персону
app.delete('/api/personas/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { error } = await supabase
      .from('personas')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id); // Перевіряємо, що видаляємо свою персону

    if (error) throw error;
    res.json({ status: 'success', message: 'Persona deleted successfully' });
  } catch (err) {
    console.error('Error deleting persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Архівувати персону
app.put('/api/personas/:id/archive', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data, error } = await supabase
      .from('personas')
      .update({ status: 'archived', updated_at: new Date() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Error archiving persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Відновити персону
app.put('/api/personas/:id/restore', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data, error } = await supabase
      .from('personas')
      .update({ status: 'active', updated_at: new Date() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Error restoring persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Оновити персону (Edit)
app.put('/api/personas/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  const { name, role, description, image, goals, frustrations, motivations, painPoints, bio, age, location } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const updates = {
        updated_at: new Date()
    };
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (description !== undefined) updates.description = description;
    if (image !== undefined) updates.image = image;
    if (goals !== undefined) updates.goals = goals;
    if (frustrations !== undefined) updates.frustrations = frustrations;
    if (motivations !== undefined) updates.motivations = motivations;
    if (painPoints !== undefined) updates.pain_points = painPoints;
    if (bio !== undefined) updates.bio = bio;
    if (age !== undefined) updates.age = age;
    if (location !== undefined) updates.location = location;

    const { data, error } = await supabase
      .from('personas')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Error updating persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- РОУТИ ДЛЯ МЕТРИК (METRICS) ---

// 1. Отримати всі метрики
app.get('/api/metrics', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data, error } = await supabase
      .from('metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Error fetching metrics:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Створити метрику
app.post('/api/metrics', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { name, type, value, previous_value, suffix, data_source, chart_type, series_data, reverse_colors } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    // Find workspace (fallback)
    let { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle();

    if (!workspace) {
        const { data: newWorkspace, error: createWsError } = await supabase
            .from('workspaces')
            .insert([{ owner_id: user.id, name: 'My Workspace' }])
            .select()
            .single();
        if (createWsError) throw createWsError;
        workspace = newWorkspace;
    }

    const { data, error } = await supabase
      .from('metrics')
      .insert([{
        name, type, value, previous_value, suffix, data_source, chart_type, series_data, reverse_colors,
        user_id: user.id,
        workspace_id: workspace.id,
        updated_at: new Date()
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Error creating metric:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Оновити метрику
app.put('/api/metrics/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  const updates = req.body;
  
  // Clean up payload
  delete updates.id;
  delete updates.user_id;
  delete updates.created_at;
  updates.updated_at = new Date();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data, error } = await supabase
      .from('metrics')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Error updating metric:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Видалити метрику
app.delete('/api/metrics/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { error } = await supabase
      .from('metrics')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    res.json({ status: 'success', message: 'Metric deleted successfully' });
  } catch (err) {
    console.error('Error deleting metric:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- РОУТИ ДЛЯ ВОРКСПЕЙСУ (WORKSPACE) ---

// Отримати воркспейс користувача
app.get('/api/workspace', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    // 1. Try to find owned workspace
    let { data: workspace, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle();

    let role = 'owner';

    // 2. If not owner, check membership
    if (!workspace) {
        const { data: memberRecord } = await supabase
            .from('workspace_members')
            .select('workspace_id, role, workspaces(*)')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();
        
        if (memberRecord) {
            workspace = memberRecord.workspaces;
            role = memberRecord.role; // 'member', 'admin', etc.
        }
    }
    
    res.json({ status: 'success', data: workspace ? { ...workspace, role } : null });
  } catch (err) {
    console.error('Error fetching workspace:', err);
    res.status(500).json({ error: err.message });
  }
});

// Оновити назву воркспейсу
app.put('/api/workspace', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { name } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data, error } = await supabase
      .from('workspaces')
      .update({ name })
      .eq('owner_id', user.id)
      .select();

    if (error) throw error;
    res.json({ status: 'success', data: data?.[0] });
  } catch (err) {
    console.error('Error updating workspace:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- TEAM ROUTES ---

// Get Team Members & Invites
app.get('/api/workspace/team', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        
        // Get workspace ID (assuming single workspace for now)
        const { data: workspace } = await supabase.from('workspaces').select('id').eq('owner_id', user.id).single();
        
        if (!workspace) return res.status(403).json({ error: 'Only workspace owners can view team settings' });

        // Get Members
        const { data: members } = await supabase
            .from('workspace_members')
            .select('id, role, joined_at, profiles(email, full_name)')
            .eq('workspace_id', workspace.id);

        // Get Pending Invites
        const { data: invites } = await supabase
            .from('workspace_invites')
            .select('*')
            .eq('workspace_id', workspace.id)
            .eq('status', 'pending');

        res.json({ 
            status: 'success', 
            data: { 
                members: members.map(m => ({ ...m, ...m.profiles })), 
                invites 
            } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Invite Member
app.post('/api/workspace/invite', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { email, role = 'member' } = req.body;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        const { data: workspace } = await supabase.from('workspaces').select('id').eq('owner_id', user.id).single();
        
        if (!workspace) return res.status(403).json({ error: 'Only owners can invite' });

        // Check if already member
        // (Logic omitted for brevity, but ideally check workspace_members first)

        const { data, error } = await supabase
            .from('workspace_invites')
            .insert([{ workspace_id: workspace.id, email, role }])
            .select()
            .single();

        if (error) throw error;
        
        // TODO: Send Email here (using SendGrid/Resend)
        
        res.json({ status: 'success', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- РОУТИ ДЛЯ ПРОФІЛЮ (PROFILE) ---

// Отримати профіль користувача
app.get('/api/profile', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    // Отримуємо додаткові дані з таблиці profiles
    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    
    // Auto-create profile if missing (Auto-Fix)
    if (!profile) {
        console.log(`[Auto-Fix] Creating profile for user ${user.id}`);
        const fullName = user.user_metadata?.full_name || '';
        const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([{ id: user.id, email: user.email, full_name: fullName }])
            .select()
            .single();
        
        if (!createError) {
            profile = newProfile;
        } else {
            console.error('Error creating profile:', createError);
        }
    }

    // Об'єднуємо дані з auth (email) та profiles (full_name)
    const data = {
        id: user.id,
        email: user.email,
        role: profile?.role || 'user', // Return role for frontend logic
        full_name: profile?.full_name || '',
    };

    res.json({ status: 'success', data });
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: err.message });
  }
});

// Оновити профіль (ім'я)
app.put('/api/profile', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { full_name } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, full_name })
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data: { ...data, email: user.email } });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- РОУТИ ДЛЯ ПІДПИСОК (SUBSCRIPTIONS) ---

// 1. Отримати активні плани (публічний)
app.get('/api/plans', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('plans')
            .select('*')
            .eq('is_active', true)
            .order('tier', { ascending: true });

        if (error) throw error;
        res.json({ status: 'success', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Призначити план користувачу (Тільки Адмін або Система)
app.post('/api/subscriptions/assign', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { userId, planId, status = 'active' } = req.body;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        // Перевірка прав адміна (спрощена, краще через middleware)
        const { data: { user } } = await supabase.auth.getUser(token);
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        
        if (profile?.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Деактивуємо старі підписки
        await supabase
            .from('subscriptions')
            .update({ status: 'canceled', current_period_end: new Date() })
            .eq('user_id', userId)
            .neq('status', 'canceled');

        // Створюємо нову
        const { data, error } = await supabase
            .from('subscriptions')
            .insert([{
                user_id: userId,
                plan_id: planId,
                status: status,
                current_period_start: new Date(),
                // current_period_end: ... (можна додати логіку +1 місяць)
            }])
            .select()
            .single();

        if (error) throw error;
        res.json({ status: 'success', data });
    } catch (err) {
        console.error('Error assigning plan:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});