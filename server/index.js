const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = require('./supabaseClient');

const app = express();
const PORT = process.env.PORT || 5005;

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

// Middleware — явний список origin для надійного CORS (localhost та 127.0.0.1)
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
];
app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // same-origin або Postman
        if (allowedOrigins.includes(origin)) return cb(null, true);
        // У dev дозволяємо будь-який localhost/127.0.0.1
        if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
        return cb(null, false); // не кидаємо Error, щоб CORS-заголовки все одно відправились
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors()); // Вмикає pre-flight (OPTIONS) для всіх маршрутів
app.use(express.json());

// --- SYSTEM LOGGING HELPER ---
async function logSystemError(error, context = '') {
    try {
        const { error: insertError } = await supabase.from('system_logs').insert([{
            level: 'error',
            message: error.message || 'Unknown error',
            details: { stack: error.stack, context }
        }]);
        if (insertError) throw insertError;
    } catch (e) {
        console.error('Failed to log system error to DB:', e);
    }
}

// --- WORKSPACE ACCESS HELPERS (owner + member) ---
async function getAccessibleWorkspaceIds(userId) {
    const { data: owned } = await supabase.from('workspaces').select('id').eq('owner_id', userId);
    const { data: member } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', userId);
    return [
        ...(owned || []).map(w => w.id),
        ...(member || []).map(w => w.workspace_id)
    ];
}

async function getCurrentWorkspaceForUser(userId) {
    const { data: owned } = await supabase.from('workspaces').select('id').eq('owner_id', userId).limit(1).maybeSingle();
    if (owned) return { id: owned.id, role: 'owner' };
    const { data: member } = await supabase.from('workspace_members').select('workspace_id, role').eq('user_id', userId).limit(1).maybeSingle();
    if (member) return { id: member.workspace_id, role: member.role || 'member' };
    return null;
}

/**
 * Get plan and limits for a workspace (plan = owner's active subscription).
 * Returns { planName, planId, maxMembers, maxJourneys, ... usage: { members, journeys, ... } } or null if no plan.
 */
async function getWorkspacePlanAndLimits(workspaceId) {
    const { data: ws } = await supabase.from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle();
    if (!ws) return null;
    const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan_id, current_period_end')
        .eq('user_id', ws.owner_id)
        .eq('status', 'active')
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!sub) return null;
    const { data: plan } = await supabase.from('plans').select('id, name, max_members, max_journeys, max_personas, max_metrics').eq('id', sub.plan_id).maybeSingle();
    if (!plan) return null;
    const [membersRes, journeysRes, personasRes, metricsRes] = await Promise.all([
        supabase.from('workspace_members').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabase.from('journeys').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabase.from('personas').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabase.from('metrics').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    ]);
    return {
        planName: plan.name,
        planId: plan.id,
        currentPeriodEnd: sub.current_period_end ?? null,
        maxMembers: plan.max_members ?? null,
        maxJourneys: plan.max_journeys ?? null,
        maxPersonas: plan.max_personas ?? null,
        maxMetrics: plan.max_metrics ?? null,
        usage: {
            members: membersRes.count ?? 0,
            journeys: journeysRes.count ?? 0,
            personas: personasRes.count ?? 0,
            metrics: metricsRes.count ?? 0,
        },
    };
}

/** Apply pending workspace invites for this user (by email). Inserts into workspace_members and marks invites accepted only on success. Returns number applied. */
async function applyPendingInvitesForUser(userId, email) {
    if (!email || !userId) return 0;
    const normalizedEmail = String(email).trim().toLowerCase();
    const { data } = await supabase
        .from('workspace_invites')
        .select('id, workspace_id, role')
        .eq('status', 'pending')
        .ilike('email', normalizedEmail);
    const invites = Array.isArray(data) ? data : [];
    let applied = 0;
    for (const invite of invites) {
        const limits = await getWorkspacePlanAndLimits(invite.workspace_id);
        if (limits && limits.maxMembers != null && limits.usage.members >= limits.maxMembers) {
            continue; // workspace at member limit, skip accepting this invite
        }
        const { error: insertErr } = await supabase
            .from('workspace_members')
            .insert({ workspace_id: invite.workspace_id, user_id: userId, role: invite.role || 'member' });
        const ok = !insertErr || insertErr.code === '23505'; // 23505 = unique violation (already member)
        if (ok) {
            await supabase.from('workspace_invites').update({ status: 'accepted' }).eq('id', invite.id);
            applied++;
        } else {
            console.error('[applyPendingInvites] workspace_members insert:', insertErr.message);
        }
    }
    return applied;
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

        // 3. Apply pending invites (only mark accepted when insert succeeds)
        await applyPendingInvitesForUser(authData.user.id, email);

        // 4. Assign Starter plan to new user (subscription per user)
        const { data: starterPlan } = await supabase
            .from('plans')
            .select('id')
            .ilike('name', 'Starter')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
        if (starterPlan) {
            const periodEnd = new Date();
            periodEnd.setMonth(periodEnd.getMonth() + 1);
            await supabase.from('subscriptions').insert([{
                user_id: authData.user.id,
                plan_id: starterPlan.id,
                status: 'active',
                current_period_start: new Date(),
                current_period_end: periodEnd,
            }]);
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

        // Apply pending workspace invites (only mark accepted when insert succeeds; duplicate = already member)
        await applyPendingInvitesForUser(data.user.id, email);

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

        await applyPendingInvitesForUser(user.id, user.email);

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

        // If no workspace yet, try applying pending invites (e.g. invited user first request after login)
        if (workspaceIds.length === 0 && user.email) {
            await applyPendingInvitesForUser(user.id, user.email);
            const { data: memberAfter } = await supabase.from('workspace_members').select('workspace_id').eq('user_id', user.id);
            workspaceIds = (memberAfter || []).map(w => w.workspace_id);
        }

        // If still no workspace, create default one (Auto-Fix for new owners only)
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
            updated_at: j.updated_at || j.created_at, // Fallback to created_at if updated_at is missing
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

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!journey.workspace_id || !workspaceIds.includes(journey.workspace_id)) {
            return res.status(404).json({ status: 'error', message: 'Journey not found' });
        }

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

        const { data: existing, error: fetchErr } = await supabase.from('journeys').select('id, workspace_id').eq('id', id).single();
        if (fetchErr || !existing) return res.status(404).json({ status: 'error', message: 'Journey not found' });
        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

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

// DELETE /api/journeys/:id — creator або власник воркспейсу може видалити
app.delete('/api/journeys/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id } = req.params;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        const { data: journey } = await supabase.from('journeys').select('id, user_id, workspace_id').eq('id', id).single();
        if (!journey) return res.status(404).json({ status: 'error', message: 'Journey not found' });
        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(journey.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });
        const isCreator = journey.user_id === user.id;
        const { data: ws } = await supabase.from('workspaces').select('owner_id').eq('id', journey.workspace_id).maybeSingle();
        const isOwner = ws && ws.owner_id === user.id;
        if (!isCreator && !isOwner) return res.status(403).json({ status: 'error', message: 'Only the creator or workspace owner can delete this journey' });

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

        const { data: original, error: fetchError } = await supabase
            .from('journeys')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError) throw fetchError;

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(original.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const { id: oldId, created_at, updated_at, ...journeyData } = original;
        const newJourney = {
            ...journeyData,
            title: `Copy of ${original.title}`,
            status: 'draft',
            updated_at: new Date(),
            user_id: user.id
        };

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

        const { data: existing } = await supabase.from('journeys').select('id, workspace_id').eq('id', id).single();
        if (!existing) return res.status(404).json({ status: 'error', message: 'Journey not found' });
        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

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

        const { data: existingJourney, error: findError } = await supabase
            .from('journeys')
            .select('id, user_id, workspace_id')
            .eq('id', id)
            .single();

        if (findError || !existingJourney) throw new Error('Journey not found');

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existingJourney.workspace_id)) {
            throw new Error('Unauthorized: You do not have permission to restore this journey');
        }

        // Perform Update (Restore to 'draft')
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
    const { title, description, workspace_id: bodyWorkspaceId } = req.body;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Invalid token');

        const allowed = await getAccessibleWorkspaceIds(user.id);
        const allowedSet = new Set((allowed || []).map(id => String(id)));
        let workspace = null;
        if (bodyWorkspaceId && allowedSet.has(String(bodyWorkspaceId))) {
            workspace = { id: bodyWorkspaceId, role: 'member' };
        }
        if (!workspace) workspace = await getCurrentWorkspaceForUser(user.id);
        if (!workspace) {
            const { data: newWorkspace, error: createWsError } = await supabase
                .from('workspaces')
                .insert([{ owner_id: user.id, name: 'My Workspace' }])
                .select()
                .single();
            if (createWsError) {
                if (createWsError.code === '42501' || createWsError.message?.includes('row-level security')) {
                    throw new Error('RLS Policy Violation: Check if SUPABASE_SERVICE_KEY in .env is the Service Role key (starts with eyJ...).');
                }
                throw createWsError;
            }
            workspace = { id: newWorkspace.id, role: 'owner' };
        }

        const planLimits = await getWorkspacePlanAndLimits(workspace.id);
        if (planLimits && planLimits.maxJourneys != null && (planLimits.usage.journeys >= planLimits.maxJourneys)) {
            return res.status(403).json({ status: 'error', code: 'LIMIT_REACHED', limit: 'journeys' });
        }

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

    await applyPendingInvitesForUser(user.id, user.email);

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

    const personasWithOwners = data.map(p => ({ 
        ...p, 
        updated_at: p.updated_at || p.created_at, // Fallback to created_at if updated_at is missing
        owner: profilesMap[p.user_id] || 'Unknown' 
    }));
    res.json({ status: 'success', data: personasWithOwners });
  } catch (err) {
    logSystemError(err, 'GET /api/personas');
    console.error('Error fetching personas:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Створити нову персону
app.post('/api/personas', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { name, role, description, image, goals, frustrations, motivations, painPoints, bio, age, location, workspace_id: bodyWorkspaceId } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    let workspace = null;
    if (bodyWorkspaceId) {
      const allowed = await getAccessibleWorkspaceIds(user.id);
      if (allowed.includes(bodyWorkspaceId)) workspace = { id: bodyWorkspaceId, role: 'member' };
    }
    if (!workspace) workspace = await getCurrentWorkspaceForUser(user.id);
    if (!workspace) {
      const { data: newWorkspace, error: createWsError } = await supabase
          .from('workspaces')
          .insert([{ owner_id: user.id, name: 'My Workspace' }])
          .select()
          .single();
      if (createWsError) throw createWsError;
      workspace = { id: newWorkspace.id, role: 'owner' };
    }

    const planLimits = await getWorkspacePlanAndLimits(workspace.id);
    if (planLimits && planLimits.maxPersonas != null && (planLimits.usage.personas >= planLimits.maxPersonas)) {
      return res.status(403).json({ status: 'error', code: 'LIMIT_REACHED', limit: 'personas' });
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
        user_id: user.id,
        workspace_id: workspace.id,
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
    logSystemError(err, 'POST /api/personas');
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
    logSystemError(err, 'DELETE /api/personas/:id');
    console.error('Error deleting persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Архівувати персону — будь-хто з доступом до воркспейсу
app.put('/api/personas/:id/archive', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: persona } = await supabase.from('personas').select('id, workspace_id').eq('id', id).single();
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(persona.workspace_id)) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase
      .from('personas')
      .update({ status: 'archived', updated_at: new Date() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'PATCH /api/personas/:id/archive');
    console.error('Error archiving persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Відновити персону — будь-хто з доступом до воркспейсу
app.put('/api/personas/:id/restore', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: persona } = await supabase.from('personas').select('id, workspace_id').eq('id', id).single();
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(persona.workspace_id)) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase
      .from('personas')
      .update({ status: 'active', updated_at: new Date() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'PATCH /api/personas/:id/restore');
    console.error('Error restoring persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Оновити персону (Edit) — будь-хто з доступом до воркспейсу
app.put('/api/personas/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  const { name, role, description, image, goals, frustrations, motivations, painPoints, bio, age, location } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: persona } = await supabase.from('personas').select('id, workspace_id').eq('id', id).single();
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(persona.workspace_id)) return res.status(403).json({ error: 'Access denied' });

    const updates = { updated_at: new Date() };
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
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'PUT /api/personas/:id');
    console.error('Error updating persona:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- РОУТИ ДЛЯ МЕТРИК (METRICS) ---

// 1. Отримати всі метрики — по доступних воркспейсах (owner + member)
app.get('/api/metrics', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    await applyPendingInvitesForUser(user.id, user.email);

    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (workspaceIds.length === 0) return res.json({ status: 'success', data: [] });

    const { data, error } = await supabase
      .from('metrics')
      .select('*')
      .in('workspace_id', workspaceIds)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ status: 'success', data: data || [] });
  } catch (err) {
    logSystemError(err, 'GET /api/metrics');
    console.error('Error fetching metrics:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Створити метрику
app.post('/api/metrics', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { name, type, value, previous_value, suffix, data_source, chart_type, series_data, reverse_colors, workspace_id: bodyWorkspaceId } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    let workspace = null;
    if (bodyWorkspaceId) {
      const allowed = await getAccessibleWorkspaceIds(user.id);
      if (allowed.includes(bodyWorkspaceId)) workspace = { id: bodyWorkspaceId, role: 'member' };
    }
    if (!workspace) workspace = await getCurrentWorkspaceForUser(user.id);
    if (!workspace) {
      const { data: newWorkspace, error: createWsError } = await supabase
          .from('workspaces')
          .insert([{ owner_id: user.id, name: 'My Workspace' }])
          .select()
          .single();
      if (createWsError) throw createWsError;
      workspace = { id: newWorkspace.id, role: 'owner' };
    }

    const planLimits = await getWorkspacePlanAndLimits(workspace.id);
    if (planLimits && planLimits.maxMetrics != null && (planLimits.usage.metrics >= planLimits.maxMetrics)) {
      return res.status(403).json({ status: 'error', code: 'LIMIT_REACHED', limit: 'metrics' });
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
    logSystemError(err, 'POST /api/metrics');
    console.error('Error creating metric:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Оновити метрику — будь-хто з доступом до воркспейсу
app.put('/api/metrics/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  const updates = { ...req.body };
  delete updates.id;
  delete updates.user_id;
  delete updates.created_at;
  updates.updated_at = new Date();

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: metric } = await supabase.from('metrics').select('id, workspace_id').eq('id', id).single();
    if (!metric) return res.status(404).json({ error: 'Metric not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(metric.workspace_id)) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase
      .from('metrics')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'PUT /api/metrics/:id');
    console.error('Error updating metric:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Видалити метрику — тільки автор (creator)
app.delete('/api/metrics/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { id } = req.params;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: metric } = await supabase.from('metrics').select('id, user_id, workspace_id').eq('id', id).single();
    if (!metric) return res.status(404).json({ error: 'Metric not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(metric.workspace_id)) return res.status(403).json({ error: 'Access denied' });
    if (metric.user_id !== user.id) return res.status(403).json({ error: 'Only the creator can delete this metric' });

    const { error } = await supabase
      .from('metrics')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ status: 'success', message: 'Metric deleted successfully' });
  } catch (err) {
    logSystemError(err, 'DELETE /api/metrics/:id');
    console.error('Error deleting metric:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- РОУТИ ДЛЯ ВОРКСПЕЙСУ (WORKSPACE) ---

// Список усіх воркспейсів користувача (owned + member) для перемикача
app.get('/api/workspace/list', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    await applyPendingInvitesForUser(user.id, user.email);

    const { data: ownedList } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('owner_id', user.id);
    const owned = (ownedList || []).map(w => ({ id: w.id, name: w.name || 'Workspace', role: 'owner' }));

    const { data: memberRows } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id);
    const ownedIds = new Set((ownedList || []).map(w => w.id));
    const memberIds = (memberRows || []).map(m => m.workspace_id).filter(id => id && !ownedIds.has(id));
    let member = [];
    if (memberIds.length > 0) {
      const { data: wsList } = await supabase.from('workspaces').select('id, name').in('id', memberIds);
      const roleByWs = Object.fromEntries((memberRows || []).map(m => [m.workspace_id, m.role || 'member']));
      member = (wsList || []).map(w => ({ id: w.id, name: w.name || 'Workspace', role: roleByWs[w.id] || 'member' }));
    }

    const list = [...owned, ...member];
    res.json({ status: 'success', data: list });
  } catch (err) {
    logSystemError(err, 'GET /api/workspace/list');
    console.error('Error fetching workspace list:', err);
    res.status(500).json({ error: err.message });
  }
});

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

    // 2. If not owner, try to apply any pending invites then check membership
    if (!workspace) {
        await applyPendingInvitesForUser(user.id, user.email);
        const { data: memberRecord } = await supabase
            .from('workspace_members')
            .select('workspace_id, role')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

        if (memberRecord) {
            const { data: ws } = await supabase
                .from('workspaces')
                .select('*')
                .eq('id', memberRecord.workspace_id)
                .single();
            if (ws) {
                workspace = ws;
                role = memberRecord.role || 'member';
            }
        }
    }

    res.json({ status: 'success', data: workspace ? { ...workspace, role } : null });
  } catch (err) {
    logSystemError(err, 'GET /api/workspace');
    console.error('Error fetching workspace:', err);
    res.status(500).json({ error: err.message });
  }
});

// Plan limits and usage for current or selected workspace (for Settings subscription block and sidebar)
app.get('/api/workspace/limits', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const workspaceIdParam = req.query.workspaceId || req.query.workspace_id;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    let workspace = null;
    if (workspaceIdParam) {
      const allowed = await getAccessibleWorkspaceIds(user.id);
      const allowedSet = new Set((allowed || []).map(id => String(id)));
      if (allowedSet.has(String(workspaceIdParam))) {
        const { data: ws } = await supabase.from('workspaces').select('id, owner_id').eq('id', workspaceIdParam).maybeSingle();
        if (ws) workspace = { id: ws.id, role: ws.owner_id === user.id ? 'owner' : 'member' };
      }
    }
    if (!workspace) workspace = await getCurrentWorkspaceForUser(user.id);
    if (!workspace) {
      return res.json({ status: 'success', data: { workspaceId: null, role: null, limits: null } });
    }

    const limits = await getWorkspacePlanAndLimits(workspace.id);
    res.json({
      status: 'success',
      data: {
        workspaceId: workspace.id,
        role: workspace.role,
        limits: limits || { planName: null, planId: null, currentPeriodEnd: null, maxMembers: null, maxJourneys: null, maxPersonas: null, maxMetrics: null, usage: { members: 0, journeys: 0, personas: 0, metrics: 0 } },
      },
    });
  } catch (err) {
    logSystemError(err, 'GET /api/workspace/limits');
    console.error('Error fetching workspace limits:', err);
    res.status(500).json({ error: err.message });
  }
});

// Оновити назву воркспейсу (тільки один за id, щоб не оновлювати всі воркспейси овнера)
app.put('/api/workspace', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { name, workspace_id: bodyWorkspaceId } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    if (!bodyWorkspaceId) return res.status(400).json({ status: 'error', message: 'workspace_id is required' });
    const { data: wsRow } = await supabase.from('workspaces').select('id').eq('id', bodyWorkspaceId).eq('owner_id', user.id).maybeSingle();
    if (!wsRow) return res.status(403).json({ status: 'error', message: 'Only workspace owner can update name' });

    const { data, error } = await supabase
      .from('workspaces')
      .update({ name })
      .eq('id', bodyWorkspaceId)
      .eq('owner_id', user.id)
      .select();

    if (error) throw error;
    res.json({ status: 'success', data: data?.[0] });
  } catch (err) {
    logSystemError(err, 'PUT /api/workspace');
    console.error('Error updating workspace:', err);
    res.status(500).json({ error: err.message });
  }
});

// Видалити воркспейс (тільки овнер; каскадно видаляє пов’язані дані)
app.delete('/api/workspace', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const workspaceId = req.body?.workspace_id || req.body?.workspaceId || req.query.workspace_id || req.query.workspaceId;
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  if (!workspaceId) return res.status(400).json({ status: 'error', message: 'workspace_id is required' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const { data: ws } = await supabase.from('workspaces').select('id').eq('id', workspaceId).eq('owner_id', user.id).maybeSingle();
    if (!ws) return res.status(403).json({ status: 'error', message: 'Only workspace owner can delete it' });

    await supabase.from('workspace_invites').delete().eq('workspace_id', workspaceId);
    await supabase.from('workspace_members').delete().eq('workspace_id', workspaceId);
    await supabase.from('journeys').delete().eq('workspace_id', workspaceId);
    await supabase.from('personas').delete().eq('workspace_id', workspaceId);
    await supabase.from('metrics').delete().eq('workspace_id', workspaceId);
    const { error: delErr } = await supabase.from('workspaces').delete().eq('id', workspaceId);

    if (delErr) throw delErr;
    res.json({ status: 'success', message: 'Workspace deleted' });
  } catch (err) {
    logSystemError(err, 'DELETE /api/workspace');
    console.error('Error deleting workspace:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- TEAM ROUTES ---

// Get Team Members & Invites
app.get('/api/workspace/team', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { workspaceId } = req.query;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        // Get workspace ID specifically
        const { data: workspace } = await supabase.from('workspaces')
            .select('id')
            .eq('owner_id', user.id)
            .eq('id', workspaceId)
            .single();
        
        if (!workspace) return res.status(403).json({ error: 'Only workspace owners can view team settings' });

        // Get Members (без join на profiles — FK може відсутній)
        const { data: members, error: membersError } = await supabase
            .from('workspace_members')
            .select('id, role, joined_at, user_id')
            .eq('workspace_id', workspace.id);

        if (membersError) throw membersError;

        // Окремо підтягуємо profiles за user_id
        const userIds = [...new Set((members || []).map(m => m.user_id).filter(Boolean))];
        let profilesMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, email, full_name')
                .in('id', userIds);
            if (profiles) profiles.forEach(p => { profilesMap[p.id] = p; });
        }

        // Якщо в profiles немає email або full_name — підтягуємо з Auth (service role)
        let authMap = {};
        const missing = userIds.filter(id => {
            const p = profilesMap[id];
            return !p?.email || !p?.full_name;
        });
        if (missing.length > 0) {
            const authResults = await Promise.all(
                missing.map(id => supabase.auth.admin.getUserById(id))
            );
            authResults.forEach((res, i) => {
                const uid = missing[i];
                const u = res.data?.user;
                if (u) authMap[uid] = { email: u.email || null, full_name: u.user_metadata?.full_name || null };
            });
        }

        const membersWithProfiles = (members || []).map(m => {
            const pid = m.user_id;
            const fromProfile = profilesMap[pid];
            const fromAuth = authMap[pid];
            return {
                ...m,
                email: fromProfile?.email ?? fromAuth?.email ?? null,
                full_name: fromProfile?.full_name ?? fromAuth?.full_name ?? null,
            };
        });

        // Get Pending Invites
        const { data: invites, error: invitesError } = await supabase
            .from('workspace_invites')
            .select('*')
            .eq('workspace_id', workspace.id)
            .eq('status', 'pending');

        if (invitesError) throw invitesError;

        res.json({ 
            status: 'success', 
            data: { 
                members: membersWithProfiles, 
                invites: invites || []
            } 
        });
    } catch (err) {
        logSystemError(err, 'GET /api/workspace/team');
        console.error('Error fetching team:', err);
        res.status(500).json({ error: err.message });
    }
});

// Invite Member
app.post('/api/workspace/invite', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { email, role = 'member', workspaceId, workspace_id } = req.body;
    const targetWorkspaceId = workspaceId || workspace_id || req.query.workspaceId || req.query.workspace_id;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    if (!targetWorkspaceId) return res.status(400).json({ error: 'Workspace ID is required' });

    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        
        const { data: workspace } = await supabase.from('workspaces')
            .select('id')
            .eq('owner_id', user.id)
            .eq('id', targetWorkspaceId)
            .single();
        
        if (!workspace) return res.status(403).json({ error: 'Only owners can invite' });

        const planLimits = await getWorkspacePlanAndLimits(workspace.id);
        if (planLimits && planLimits.maxMembers != null && (planLimits.usage.members >= planLimits.maxMembers)) {
            return res.status(403).json({ status: 'error', code: 'LIMIT_REACHED', limit: 'members' });
        }

        const { data: existingInvite } = await supabase
            .from('workspace_invites')
            .select('id')
            .eq('workspace_id', workspace.id)
            .eq('email', email)
            .eq('status', 'pending')
            .maybeSingle();
        if (existingInvite) {
            return res.json({ status: 'success', message: 'Invite already sent to this email.', data: { id: existingInvite.id } });
        }

        const { data, error } = await supabase
            .from('workspace_invites')
            .insert([{ workspace_id: workspace.id, email, role }])
            .select()
            .single();

        if (error) throw error;

        console.log(`📧 [MOCK EMAIL] Sending invite to ${email} for workspace ${workspace.id}`);

        res.json({ status: 'success', message: 'Invite sent successfully.', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cancel (revoke) a pending invite — тільки власник воркспейсу
app.delete('/api/workspace/invite/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id: inviteId } = req.params;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        const { data: invite } = await supabase.from('workspace_invites')
            .select('id, workspace_id')
            .eq('id', inviteId)
            .single();
        if (!invite) return res.status(404).json({ error: 'Invite not found' });

        const { data: workspace } = await supabase.from('workspaces')
            .select('id')
            .eq('id', invite.workspace_id)
            .eq('owner_id', user.id)
            .single();
        if (!workspace) return res.status(403).json({ error: 'Only workspace owner can cancel invites' });

        const { error } = await supabase
            .from('workspace_invites')
            .delete()
            .eq('id', inviteId);
        if (error) throw error;
        res.json({ status: 'success', message: 'Invite cancelled' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Remove a member from workspace — тільки власник воркспейсу
app.delete('/api/workspace/member/:id', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { id: memberRowId } = req.params;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        const { data: member } = await supabase.from('workspace_members')
            .select('id, workspace_id')
            .eq('id', memberRowId)
            .single();
        if (!member) return res.status(404).json({ error: 'Member not found' });

        const { data: workspace } = await supabase.from('workspaces')
            .select('id')
            .eq('id', member.workspace_id)
            .eq('owner_id', user.id)
            .single();
        if (!workspace) return res.status(403).json({ error: 'Only workspace owner can remove members' });

        const { error } = await supabase
            .from('workspace_members')
            .delete()
            .eq('id', memberRowId);
        if (error) throw error;
        res.json({ status: 'success', message: 'Member removed from workspace' });
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
    
    // Auto-create profile if missing (Auto-Fix) — use RPC to bypass RLS
    if (!profile) {
        console.log(`[Auto-Fix] Creating profile for user ${user.id}`);
        const fullName = (user.user_metadata?.full_name || (user.email && user.email.split('@')[0]) || '').trim() || 'User';
        const { error: rpcError } = await supabase.rpc('insert_profile_for_user', {
            p_user_id: user.id,
            p_email: user.email || '',
            p_full_name: fullName,
        });
        if (!rpcError) {
            const { data: newProfile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
            if (newProfile) profile = newProfile;
        } else {
            console.error('Error creating profile:', rpcError);
        }
    }

    // Об'єднуємо дані з auth (email) та profiles (full_name); якщо збережено "User" — показуємо частину email
    const rawName = profile?.full_name || '';
    const displayName = (rawName && rawName !== 'User') ? rawName : (user.email && user.email.split('@')[0]) || rawName || '';
    const data = {
        id: user.id,
        email: user.email,
        role: profile?.role || 'user',
        full_name: displayName,
    };

    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'GET /api/profile');
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
    logSystemError(err, 'PUT /api/profile');
    console.error('Error updating profile:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- SUPPORT & FEEDBACK (two-way: user submits, admin replies, user sees badge) ---

// Create submission (Report issue / Send idea)
app.post('/api/feedback', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { type, subject, body, steps_to_reproduce, attachment_url, category } = req.body;
    if (!type || !subject || !body || !['issue', 'idea'].includes(type)) {
      return res.status(400).json({ status: 'error', message: 'type (issue|idea), subject, body required' });
    }
    const row = {
      user_id: user.id,
      type,
      subject: String(subject).trim(),
      body: String(body).trim(),
      steps_to_reproduce: type === 'issue' ? (steps_to_reproduce && String(steps_to_reproduce).trim()) || null : null,
      attachment_url: type === 'issue' ? (attachment_url && String(attachment_url).trim()) || null : null,
      category: type === 'idea' ? (category && String(category).trim()) || null : null,
      status: 'open',
    };
    // RLS: feedback_insert_own requires auth.uid() = user_id — use client with user JWT so insert runs as that user
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const client = anonKey
      ? createClient(process.env.SUPABASE_URL, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
      : supabase;
    const { data, error } = await client.from('feedback').insert([row]).select().single();
    if (error) throw error;
    res.status(201).json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'POST /api/feedback');
    console.error('Error creating feedback:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// List my feedback (with unread count per item for badge in list)
app.get('/api/feedback', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { data: list, error } = await supabase
      .from('feedback')
      .select('id, type, subject, status, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const ids = (list || []).map((f) => f.id);
    if (ids.length === 0) return res.json({ status: 'success', data: list || [] });
    const { data: replyCounts } = await supabase
      .from('feedback_replies')
      .select('feedback_id')
      .eq('author_type', 'admin')
      .is('read_at', null);
    const unreadByFeedback = {};
    (replyCounts || []).forEach((r) => { unreadByFeedback[r.feedback_id] = (unreadByFeedback[r.feedback_id] || 0) + 1; });
    const withUnread = (list || []).map((f) => ({ ...f, unread_count: unreadByFeedback[f.id] || 0 }));
    res.json({ status: 'success', data: withUnread });
  } catch (err) {
    logSystemError(err, 'GET /api/feedback');
    console.error('Error listing feedback:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Unread count (for red badge next to Support button) — must be before /:id
app.get('/api/feedback/unread-count', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { data: myFeedback } = await supabase.from('feedback').select('id').eq('user_id', user.id);
    const ids = (myFeedback || []).map((f) => f.id);
    if (ids.length === 0) return res.json({ status: 'success', data: 0 });
    const { count, error } = await supabase
      .from('feedback_replies')
      .select('*', { count: 'exact', head: true })
      .in('feedback_id', ids)
      .eq('author_type', 'admin')
      .is('read_at', null);
    if (error) throw error;
    res.json({ status: 'success', data: count ?? 0 });
  } catch (err) {
    logSystemError(err, 'GET /api/feedback/unread-count');
    console.error('Error getting unread count:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Get one thread (feedback + replies)
app.get('/api/feedback/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { id } = req.params;
    const { data: feedback, error: feedError } = await supabase
      .from('feedback')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (feedError || !feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { data: replies, error: repError } = await supabase
      .from('feedback_replies')
      .select('id, author_type, body, read_at, created_at')
      .eq('feedback_id', id)
      .order('created_at', { ascending: true });
    if (repError) throw repError;
    res.json({ status: 'success', data: { ...feedback, replies: replies || [] } });
  } catch (err) {
    logSystemError(err, 'GET /api/feedback/:id');
    console.error('Error getting feedback thread:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Mark admin replies as read (when user opens thread)
app.patch('/api/feedback/:id/read', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { id } = req.params;
    const { data: feedback } = await supabase.from('feedback').select('id').eq('id', id).eq('user_id', user.id).single();
    if (!feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { error: updateErr } = await supabase
      .from('feedback_replies')
      .update({ read_at: new Date().toISOString() })
      .eq('feedback_id', id)
      .eq('author_type', 'admin')
      .is('read_at', null);
    if (updateErr) throw updateErr;
    res.json({ status: 'success' });
  } catch (err) {
    logSystemError(err, 'PATCH /api/feedback/:id/read');
    console.error('Error marking feedback read:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Delete own feedback (ticket) — replies deleted by FK CASCADE
app.delete('/api/feedback/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { id } = req.params;
    const { data: feedback } = await supabase.from('feedback').select('id').eq('id', id).eq('user_id', user.id).single();
    if (!feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { error: delError } = await supabase.from('feedback').delete().eq('id', id);
    if (delError) throw delError;
    res.json({ status: 'success' });
  } catch (err) {
    logSystemError(err, 'DELETE /api/feedback/:id');
    console.error('Error deleting feedback:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// --- Admin: list all feedback ---
app.get('/api/admin/feedback', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ status: 'error', message: 'Access denied' });
    const { data, error } = await supabase
      .from('feedback')
      .select('id, user_id, type, subject, status, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ status: 'success', data: data || [] });
  } catch (err) {
    logSystemError(err, 'GET /api/admin/feedback');
    console.error('Error listing admin feedback:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// --- Admin: feedback count (total + open/unreplied) for sidebar badge ---
app.get('/api/admin/feedback/count', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ status: 'error', message: 'Access denied' });
    const { count: total, error: totalErr } = await supabase.from('feedback').select('*', { count: 'exact', head: true });
    if (totalErr) throw totalErr;
    const { count: open, error: openErr } = await supabase.from('feedback').select('*', { count: 'exact', head: true }).eq('status', 'open');
    if (openErr) throw openErr;
    res.json({ status: 'success', data: { total: total ?? 0, open: open ?? 0 } });
  } catch (err) {
    logSystemError(err, 'GET /api/admin/feedback/count');
    console.error('Error getting admin feedback count:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// --- Admin: get one thread + post reply ---
app.get('/api/admin/feedback/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ status: 'error', message: 'Access denied' });
    const { id } = req.params;
    const { data: feedback, error: feedError } = await supabase.from('feedback').select('*').eq('id', id).single();
    if (feedError || !feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { data: replies } = await supabase
      .from('feedback_replies')
      .select('id, author_type, body, read_at, created_at')
      .eq('feedback_id', id)
      .order('created_at', { ascending: true });
    res.json({ status: 'success', data: { ...feedback, replies: replies || [] } });
  } catch (err) {
    logSystemError(err, 'GET /api/admin/feedback/:id');
    console.error('Error getting admin feedback thread:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.post('/api/admin/feedback/:id/reply', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ status: 'error', message: 'Access denied' });
    const { id } = req.params;
    const { body } = req.body;
    if (!body || !String(body).trim()) return res.status(400).json({ status: 'error', message: 'body required' });
    const { data: feedback } = await supabase.from('feedback').select('id').eq('id', id).single();
    if (!feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { data: reply, error } = await supabase
      .from('feedback_replies')
      .insert([{ feedback_id: id, author_type: 'admin', author_id: user.id, body: String(body).trim() }])
      .select()
      .single();
    if (error) throw error;
    await supabase.from('feedback').update({ status: 'replied', updated_at: new Date().toISOString() }).eq('id', id);
    res.status(201).json({ status: 'success', data: reply });
  } catch (err) {
    logSystemError(err, 'POST /api/admin/feedback/:id/reply');
    console.error('Error posting admin reply:', err);
    res.status(500).json({ status: 'error', error: err.message });
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

// --- ADMIN USER MANAGEMENT ---

// Get User Details (Full View)
// Приймаємо обидва варіанти URL, щоб не залежати від кешу фронтенда
app.get(['/api/users-manage/:id', '/api/admin/users/:id'], async (req, res) => {
    const { id } = req.params;
    console.log(`🔍 [MANAGE] Fetching details for user: ${id}`);

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        console.log('❌ No token provided');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Check Admin
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
             console.log('❌ Auth error:', authError);
             return res.status(401).json({ error: 'Invalid token' });
        }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'admin') {
            console.log(`❌ Access denied for user ${user.id} (role: ${profile?.role})`);
            return res.status(403).json({
                error: 'Access denied',
                message: "Your account needs role 'admin' in the profiles table to view user details.",
            });
        }

        // 1. Profile
        const { data: userProfile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();
        
        if (profileError) {
            console.error("❌ Profile error:", profileError);
            return res.status(404).json({
                error: 'User not found',
                message: 'No profile found for this user id.',
            });
        }

        // 2. Workspaces (Owned & Joined)
        const { data: ownedWorkspaces } = await supabase
            .from('workspaces')
            .select('*, workspace_members(count)')
            .eq('owner_id', id);
        
        const { data: joinedWorkspaces } = await supabase
            .from('workspace_members')
            .select('role, joined_at, workspaces(*)')
            .eq('user_id', id);

        // 3. Subscriptions (History)
        const { data: subscriptions } = await supabase
            .from('subscriptions')
            .select('*, plans(name, price_monthly)')
            .eq('user_id', id)
            .order('created_at', { ascending: false });

        console.log(`✅ Found user: ${userProfile.email}`);

        res.json({
            status: 'success',
            data: {
                profile: userProfile,
                owned_workspaces: ownedWorkspaces || [],
                joined_workspaces: joinedWorkspaces || [],
                subscriptions: subscriptions || []
            }
        });

    } catch (err) {
        console.error('❌ SERVER ERROR:', err);
        res.status(500).json({ error: err.message });
    }
});

// Assign Plan (Manual Admin Override)
// Приймаємо обидва варіанти URL
app.post(['/api/users-manage/assign-plan', '/api/admin/users/assign-plan'], async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { userId, planId, durationDays, customEndDate } = req.body;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: { user } } = await supabase.auth.getUser(token);
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

        let endDate = new Date();
        if (customEndDate) {
            endDate = new Date(customEndDate);
        } else if (durationDays) {
            endDate.setDate(endDate.getDate() + parseInt(durationDays));
        } else {
            endDate.setMonth(endDate.getMonth() + 1);
        }

        // Call existing logic or reuse code. For simplicity, we reuse the logic but with custom date.
        // Deactivate old active subs
        await supabase.from('subscriptions').update({ status: 'canceled' }).eq('user_id', userId).eq('status', 'active');

        const { data, error } = await supabase.from('subscriptions').insert([{ user_id: userId, plan_id: planId, status: 'active', current_period_start: new Date(), current_period_end: endDate }]).select().single();
        if (error) throw error;
        res.json({ status: 'success', data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Усі незбіги маршрутів — JSON 404 (щоб клієнт завжди отримував JSON)
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        message: `${req.method} ${req.path} is not registered on this server.`,
        path: req.path,
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});