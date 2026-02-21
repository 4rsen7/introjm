const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = require('./supabaseClient');
const supabaseAdmin = supabase.supabaseAdmin || supabase;
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5005;

// Required when running behind a proxy (e.g. Render, Vercel) so rate-limit and IP detection work
app.set('trust proxy', 1);

// GLOBAL LOGGER: Log every single request hitting the server
app.use((req, res, next) => {
    console.log(`📡 [INCOMING] ${req.method} ${req.url}`);
    next();
});

// Initialize Storage Bucket
(async () => {
    try {
        const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
        if (error) console.error('Error listing buckets:', error);
        
        if (buckets && !buckets.find(b => b.name === 'journey_images')) {
            console.log('Creating "journey_images" bucket...');
            await supabaseAdmin.storage.createBucket('journey_images', {
                public: true,
                fileSizeLimit: 2097152, // 2MB limit enforced by Supabase
                allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
            });
        }
    } catch (e) {
        console.error('Storage init error:', e);
    }
})();

// Middleware: CORS налаштування (Local + Production)
const allowedOrigins = [
  // Локальна розробка
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  
  // Продакшн (Vercel) - ДОДАЙ СВОЇ РЕАЛЬНІ ПОСИЛАННЯ
  'https://iterojm.vercel.app',        // Основне посилання (якщо є)
  'https://iterojm-app.vercel.app',    // Твій Клієнт
  'https://iterojm-admin.vercel.app'   // Твоя Адмінка
];

app.use(cors({
  origin: (origin, callback) => {
      // 1. Дозволяємо запити без origin (Postman, серверні скрипти)
      if (!origin) return callback(null, true);

      // 2. Перевіряємо, чи є origin у білому списку
      if (allowedOrigins.indexOf(origin) !== -1) {
          return callback(null, true);
      }

      // 3. Додаткова перевірка для будь-якого Localhost (на випадок інших портів)
      // Це дозволить тобі працювати локально, навіть якщо порт зміниться
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
      }

      // 4. Якщо нічого не підійшло — блокуємо
      console.log('Blocked by CORS:', origin);
      return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Вмикає pre-flight для всіх маршрутів
app.options('*', cors());

// Lemon Squeezy webhook: must receive raw body for signature verification (register before express.json)
app.post('/api/webhooks/lemonsqueezy', express.raw({ type: 'application/json' }), async (req, res) => {
    // #region agent log
    const _dbg = (msg, data, hypothesisId) => {
        console.log('[LS webhook]', hypothesisId || '', msg, data !== undefined ? JSON.stringify(data) : '');
        fetch('http://127.0.0.1:7242/ingest/421f9409-2981-4f25-bb49-df405f2a7d1b', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '69a3de' }, body: JSON.stringify({ sessionId: '69a3de', location: 'index.js:webhook', message: msg, data: data || {}, timestamp: Date.now(), hypothesisId: hypothesisId || null }) }).catch(() => {});
    };
    // #endregion
    _dbg('webhook hit', { hasBody: !!req.body, bodyIsBuffer: Buffer.isBuffer(req.body), hasSignature: !!req.get('X-Signature') }, 'A');
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) {
        _dbg('secret missing', {}, 'B');
        console.error('LEMONSQUEEZY_WEBHOOK_SECRET is not set');
        return res.status(500).json({ error: 'Webhook not configured' });
    }
    const rawBody = req.body;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
        return res.status(400).json({ error: 'Invalid body' });
    }
    const signature = req.get('X-Signature');
    if (!signature) {
        _dbg('missing X-Signature', {}, 'B');
        return res.status(401).json({ error: 'Missing X-Signature' });
    }
    try {
        const hmac = crypto.createHmac('sha256', secret);
        const digest = hmac.update(rawBody).digest('hex');
        const sigBuf = Buffer.from(signature, 'utf8');
        const digestBuf = Buffer.from(digest, 'utf8');
        if (sigBuf.length !== digestBuf.length || !crypto.timingSafeEqual(digestBuf, sigBuf)) {
            _dbg('signature invalid', { sigLen: sigBuf.length, digestLen: digestBuf.length }, 'B');
            return res.status(401).json({ error: 'Invalid signature' });
        }
    } catch (e) {
        _dbg('signature error', { err: e.message }, 'B');
        return res.status(401).json({ error: 'Invalid signature' });
    }
    let payload;
    try {
        payload = JSON.parse(rawBody.toString('utf8'));
    } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON' });
    }
    const eventName = payload?.meta?.event_name;
    const customData = payload?.meta?.custom_data || {};
    const data = payload?.data;
    const attrs = data?.attributes || {};
    let variantId = null;
    let userEmail = null;
    if (eventName === 'order_created') {
        variantId = attrs?.first_order_item?.variant_id;
        userEmail = attrs?.user_email;
    } else if (eventName === 'subscription_created') {
        variantId = attrs?.variant_id;
        userEmail = attrs?.user_email;
    }
    // subscription_payment_success sends subscription-invoices (no variant_id); fetch subscription from API to get variant_id
    if (eventName === 'subscription_payment_success') {
        const subscriptionId = attrs?.subscription_id;
        const apiKey = process.env.LEMONSQUEEZY_API_KEY;
        userEmail = attrs?.user_email || userEmail;
        if (apiKey && subscriptionId) {
            try {
                const subRes = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionId}`, {
                    headers: { 'Accept': 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json', 'Authorization': `Bearer ${apiKey}` }
                });
                const subJson = await subRes.json();
                const subAttrs = subJson?.data?.attributes;
                variantId = subAttrs?.variant_id;
                _dbg('subscription_payment_success fetched subscription', { subscriptionId, variantId, hasUser: !!customData.user_id }, 'C');
            } catch (e) {
                _dbg('subscription_payment_success fetch failed', { err: e.message }, 'C');
            }
        }
        if (!variantId) {
            _dbg('subscription_payment_success no variant_id', { hasApiKey: !!apiKey, subscriptionId }, 'C');
            return res.status(200).json({ ok: true, message: 'Payment acknowledged; set LEMONSQUEEZY_API_KEY and subscription_id to update plan' });
        }
        // fall through to plan lookup and subscription update below
    }
    // #region agent log
    _dbg('parsed event', { eventName, variantId, variantIdType: typeof variantId, userEmail: userEmail ? '***@***' : null, hasCustomUserId: !!customData.user_id }, 'C');
    // #endregion
    if (!variantId && eventName !== 'subscription_cancelled') {
        _dbg('event ignored no variant', { eventName }, 'C');
        return res.status(200).json({ ok: true, message: 'Event ignored' });
    }
    if (eventName === 'subscription_cancelled') {
        return res.status(200).json({ ok: true, message: 'Cancellation acknowledged' });
    }
    const variantIdStr = String(variantId);
    const { data: planRow, error: planError } = await supabaseAdmin
        .from('plans')
        .select('id, lemonsqueezy_variant_id_monthly, lemonsqueezy_variant_id_yearly')
        .or(`lemonsqueezy_variant_id_monthly.eq.${variantIdStr},lemonsqueezy_variant_id_yearly.eq.${variantIdStr}`)
        .limit(1)
        .maybeSingle();
    // #region agent log
    _dbg('plan lookup', { variantIdStr, planFound: !!planRow, planId: planRow?.id, planError: planError?.message }, 'D');
    // #endregion
    if (!planRow) {
        console.warn('Lemon Squeezy webhook: no plan found for variant_id', variantIdStr);
        return res.status(200).json({ ok: true, message: 'Plan not mapped' });
    }
    const interval = planRow.lemonsqueezy_variant_id_monthly === variantIdStr ? 'monthly' : 'yearly';
    let userId = customData.user_id || null;
    if (!userId && userEmail) {
        const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const users = listData?.users;
        if (!listErr && Array.isArray(users)) {
            const match = users.find((u) => (u.email || '').toLowerCase() === String(userEmail).toLowerCase());
            if (match) userId = match.id;
        }
        // #region agent log
        _dbg('user by email', { userEmailLen: userEmail?.length, listErr: listErr?.message, usersCount: users?.length, userIdResolved: !!userId }, 'E');
        // #endregion
    }
    if (!userId) {
        _dbg('user not found', { hasCustomUserId: !!customData.user_id }, 'E');
        console.warn('Lemon Squeezy webhook: could not resolve user for email', userEmail);
        return res.status(200).json({ ok: true, message: 'User not found' });
    }
    const periodStart = new Date();
    const periodEnd = new Date();
    if (interval === 'yearly') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
    const { error: updateErr } = await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'canceled' })
        .eq('user_id', userId)
        .eq('status', 'active');
    // #region agent log
    _dbg('cancel old', { userId: userId.slice(0, 8) + '...', updateErr: updateErr?.message }, 'F');
    // #endregion
    const { error: insertErr } = await supabaseAdmin.from('subscriptions').insert([{
        user_id: userId,
        plan_id: planRow.id,
        status: 'active',
        current_period_start: periodStart,
        current_period_end: periodEnd,
    }]);
    // #region agent log
    _dbg('insert new', { planId: planRow.id, insertErr: insertErr?.message, insertCode: insertErr?.code }, 'F');
    // #endregion
    if (insertErr) {
        console.error('Lemon Squeezy webhook: subscription insert failed', insertErr);
        return res.status(500).json({ error: 'Failed to create subscription' });
    }
    _dbg('success', { planId: planRow.id, interval }, null);
    return res.status(200).json({ ok: true });
});

app.use(express.json());

// Rate limit for auth: 10 requests per minute per IP
const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { status: 'error', error: 'Too many requests, try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// --- SYSTEM LOGGING HELPER ---
async function logSystemError(error, context = '') {
    try {
        const { error: insertError } = await supabaseAdmin.from('system_logs').insert([{
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
// Use supabaseAdmin so RLS never blocks reads (server has validated user via token).
// Prevents false "no workspace" when anon key + RLS would return empty on local.
async function getAccessibleWorkspaceIds(userId) {
    const { data: owned } = await supabaseAdmin.from('workspaces').select('id').eq('owner_id', userId);
    const { data: member } = await supabaseAdmin.from('workspace_members').select('workspace_id').eq('user_id', userId);
    return [
        ...(owned || []).map(w => w.id),
        ...(member || []).map(w => w.workspace_id)
    ];
}

async function getCurrentWorkspaceForUser(userId) {
    const { data: owned } = await supabaseAdmin.from('workspaces').select('id').eq('owner_id', userId).limit(1).maybeSingle();
    if (owned) return { id: owned.id, role: 'owner' };
    const { data: member } = await supabaseAdmin.from('workspace_members').select('workspace_id, role').eq('user_id', userId).limit(1).maybeSingle();
    if (member) return { id: member.workspace_id, role: member.role || 'member' };
    return null;
}

/**
 * Get plan and limits for a workspace (plan = owner's active subscription).
 * Returns { planName, planId, maxMembers, maxJourneys, ... usage: { members, journeys, ... } } or null if no plan.
 */
async function getWorkspacePlanAndLimits(workspaceId) {
    const { data: ws } = await supabaseAdmin.from('workspaces').select('owner_id').eq('id', workspaceId).maybeSingle();
    if (!ws) return null;
    // Use admin so members can see owner's subscription (RLS on subscriptions typically allows only own rows).
    const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('plan_id, current_period_end')
        .eq('user_id', ws.owner_id)
        .eq('status', 'active')
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!sub) return null;
    const { data: plan } = await supabaseAdmin.from('plans').select('id, name, max_members, max_journeys, max_personas, max_metrics').eq('id', sub.plan_id).maybeSingle();
    if (!plan) return null;
    const [membersRes, journeysRes, personasRes, metricsRes] = await Promise.all([
        supabaseAdmin.from('workspace_members').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabaseAdmin.from('journeys').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabaseAdmin.from('personas').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
        supabaseAdmin.from('metrics').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
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

/** Supabase client with user JWT for RLS-sensitive inserts (e.g. workspaces). Uses anon key + token; falls back to global supabase if no anon key. */
function createSupabaseClientWithUserToken(token) {
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (anonKey && token) {
        return createClient(process.env.SUPABASE_URL, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    }
    return supabase;
}

/** Ensure user has an active Starter subscription (idempotent). Uses admin client so RLS does not block. Call after creating default workspace for new users. */
async function ensureStarterSubscriptionForUser(userId) {
    const { data: existing } = await supabaseAdmin.from('subscriptions').select('id').eq('user_id', userId).eq('status', 'active').limit(1).maybeSingle();
    if (existing) return;
    const { data: starterPlan } = await supabaseAdmin.from('plans').select('id').ilike('name', 'Starter').eq('is_active', true).limit(1).maybeSingle();
    if (!starterPlan) return;
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    await supabaseAdmin.from('subscriptions').insert([{ user_id: userId, plan_id: starterPlan.id, status: 'active', current_period_start: new Date(), current_period_end: periodEnd }]);
}

/** True if user was created recently (e.g. last 48h). Used to auto-create workspace only for new users, not for removed members. */
function isNewUser(user) {
    const createdAt = user?.created_at;
    if (!createdAt) return true;
    const created = new Date(createdAt).getTime();
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    return created >= cutoff;
}

/** Apply pending workspace invites for this user (by email). Inserts into workspace_members and marks invites accepted only on success. Returns number applied. */
async function applyPendingInvitesForUser(userId, email) {
    if (!email || !userId) return 0;
    const normalizedEmail = String(email).trim().toLowerCase();
    // Use admin so invited user can "see" their invites (RLS typically allows only workspace owners to read invites)
    const { data } = await supabaseAdmin
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
        const { error: insertErr } = await supabaseAdmin
            .from('workspace_members')
            .insert({ workspace_id: invite.workspace_id, user_id: userId, role: invite.role || 'member' });
        const ok = !insertErr || insertErr.code === '23505'; // 23505 = unique violation (already member)
        if (ok) {
            await supabaseAdmin.from('workspace_invites').update({ status: 'accepted' }).eq('id', invite.id);
            applied++;
        } else {
            console.error('[applyPendingInvites] workspace_members insert:', insertErr.message);
        }
    }
    return applied;
}

/** Validate auth body (email + password). Returns { ok: true } or { ok: false, error: string }. */
function validateAuthBody(body, isRegister = false) {
    const email = body.email != null ? String(body.email).trim() : '';
    const password = body.password != null ? String(body.password) : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) return { ok: false, error: 'Email is required' };
    if (!emailRegex.test(email)) return { ok: false, error: 'Invalid email' };
    if (!password) return { ok: false, error: 'Password is required' };
    if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
    return { ok: true };
}

// Auth Routes

// Register Route
app.post('/api/register', async (req, res) => {
    const { email, password, firstName, lastName } = req.body;
    const validation = validateAuthBody(req.body, true);
    if (!validation.ok) return res.status(400).json({ status: 'error', error: validation.error });
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
            
            const { error: profileError } = await supabaseAdmin
                .from('profiles')
                .insert([
                    { id: authData.user.id, full_name: fullName }
                ]);

            if (profileError) throw profileError;
        }

        // 3. Apply pending invites (only mark accepted when insert succeeds)
        await applyPendingInvitesForUser(authData.user.id, email);

        // 4. Assign Starter plan to new user (subscription per user)
        const { data: starterPlan } = await supabaseAdmin
            .from('plans')
            .select('id')
            .ilike('name', 'Starter')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
        if (starterPlan) {
            const periodEnd = new Date();
            periodEnd.setMonth(periodEnd.getMonth() + 1);
            await supabaseAdmin.from('subscriptions').insert([{
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
    const validation = validateAuthBody(req.body);
    if (!validation.ok) return res.status(400).json({ status: 'error', error: validation.error });
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

        // 1. Get user's workspaces (Owned + Member) — use admin for reliable reads (avoids RLS blocking on local)
        let workspaceIds = await getAccessibleWorkspaceIds(user.id);

        // If no workspace yet, try applying pending invites (e.g. invited user first request after login)
        if (workspaceIds.length === 0 && user.email) {
            await applyPendingInvitesForUser(user.id, user.email);
            workspaceIds = await getAccessibleWorkspaceIds(user.id);
        }

        // If still no workspace, create default one only for new users (not for removed members).
        if (workspaceIds.length === 0 && isNewUser(user)) {
            // Re-check with admin before create (avoids race when multiple requests run in parallel)
            workspaceIds = await getAccessibleWorkspaceIds(user.id);
            if (workspaceIds.length > 0) { /* another request created it */ } else {
            console.log(`[Auto-Fix] Creating default workspace for user ${user.id}`);
            const { data: newWorkspace, error: createWsError } = await supabaseAdmin
                .from('workspaces')
                .insert([{ owner_id: user.id, name: 'My Workspace' }])
                .select()
                .single();
            if (!createWsError && newWorkspace) {
                workspaceIds = [newWorkspace.id];
                await ensureStarterSubscriptionForUser(user.id);
            } else if (createWsError?.code === '23505') {
                const { data: ownedAgain } = await supabaseAdmin.from('workspaces').select('id').eq('owner_id', user.id);
                workspaceIds = (ownedAgain || []).map(w => w.id);
                await ensureStarterSubscriptionForUser(user.id);
            } else {
                if (createWsError) console.error('Error creating default workspace:', createWsError);
                if (createWsError?.code === '42501') console.error('Tip: set SUPABASE_SERVICE_ROLE_KEY in .env to your project’s service_role key (Supabase Dashboard → Settings → API).');
                return res.json({ status: 'success', data: [] });
            }
            }
        }

        // 2. Get journeys from ALL accessible workspaces — admin for reliable read (RLS)
        const { data: journeys, error: journeyError } = await supabaseAdmin
            .from('journeys')
            .select('*')
            .in('workspace_id', workspaceIds)
            .order('created_at', { ascending: false });

        if (journeyError) throw journeyError;

        // Fetch profiles to map owner names (admin so members can see workspace owner's name)
        const userIds = [...new Set(journeys.map(j => j.user_id).filter(Boolean))];
        let profilesMap = {};
        
        if (userIds.length > 0) {
            const { data: profiles } = await supabaseAdmin
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

        // Fetch owner name (admin so member can see creator name)
        let ownerName = '';
        if (journey.user_id) {
             const { data: profile } = await supabaseAdmin
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
    const { title, description, status, map_data, user_id: newOwnerId } = req.body;

    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return res.status(401).json({ status: 'error', message: 'Invalid token' });
        }

        const { data: existing, error: fetchErr } = await supabaseAdmin.from('journeys').select('id, workspace_id, user_id').eq('id', id).single();
        if (fetchErr || !existing) return res.status(404).json({ status: 'error', message: 'Journey not found' });
        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const updates = {
            updated_at: new Date().toISOString()
        };
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (status !== undefined) updates.status = status;
        if (map_data !== undefined) {
            updates.map_data = typeof map_data === 'string' ? map_data : JSON.stringify(map_data);
        }

        // Only validate and apply owner change when the owner is actually being changed
        const ownerActuallyChanging = newOwnerId !== undefined && newOwnerId !== null && newOwnerId !== '' && String(newOwnerId) !== String(existing.user_id);
        if (ownerActuallyChanging) {
            const { data: ws } = await supabaseAdmin.from('workspaces').select('owner_id').eq('id', existing.workspace_id).maybeSingle();
            const isWorkspaceOwner = ws && ws.owner_id === user.id;
            const isCurrentJourneyOwner = existing.user_id === user.id;
            if (!isWorkspaceOwner && !isCurrentJourneyOwner) {
                return res.status(403).json({ status: 'error', message: 'Only workspace owner or journey owner can change owner' });
            }
            const isNewOwnerInWorkspace = ws && ws.owner_id === newOwnerId ||
                await (async () => {
                    const { data: m } = await supabaseAdmin.from('workspace_members').select('user_id').eq('workspace_id', existing.workspace_id).eq('user_id', newOwnerId).limit(1).maybeSingle();
                    return !!m;
                })();
            if (!isNewOwnerInWorkspace) {
                return res.status(400).json({ status: 'error', message: 'New owner must be a member of the workspace' });
            }
            updates.user_id = newOwnerId;
        }

        const { error: updateError } = await supabaseAdmin
            .from('journeys')
            .update(updates)
            .eq('id', existing.id);

        if (updateError) throw updateError;

        const { data: journey, error: selectError } = await supabaseAdmin
            .from('journeys')
            .select('*')
            .eq('id', existing.id)
            .single();

        if (selectError || !journey) {
            console.error('Journey update succeeded but select failed:', selectError);
            return res.status(500).json({ status: 'error', error: 'Failed to return updated journey' });
        }

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

        const { data: journey } = await supabaseAdmin.from('journeys').select('id, user_id, workspace_id').eq('id', id).single();
        if (!journey) return res.status(404).json({ status: 'error', message: 'Journey not found' });
        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(journey.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });
        const isCreator = journey.user_id === user.id;
        const { data: ws } = await supabaseAdmin.from('workspaces').select('owner_id').eq('id', journey.workspace_id).maybeSingle();
        const isOwner = ws && ws.owner_id === user.id;
        if (!isCreator && !isOwner) return res.status(403).json({ status: 'error', message: 'Only the creator or workspace owner can delete this journey' });

        const { error } = await supabaseAdmin
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

        const { data: duplicated, error: insertError } = await supabaseAdmin
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

        const { data: existing } = await supabaseAdmin.from('journeys').select('id, workspace_id').eq('id', id).single();
        if (!existing) return res.status(404).json({ status: 'error', message: 'Journey not found' });
        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(existing.workspace_id)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const { data: journey, error } = await supabaseAdmin
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
        
        const { data, error: updateError } = await supabaseAdmin
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
            const { data: check } = await supabaseAdmin.from('journeys').select('id, status').eq('id', id);
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
        if (!workspace && isNewUser(user)) {
            const { data: newWorkspace, error: createWsError } = await supabaseAdmin
                .from('workspaces')
                .insert([{ owner_id: user.id, name: 'My Workspace' }])
                .select()
                .single();
            if (!createWsError && newWorkspace) {
                workspace = { id: newWorkspace.id, role: 'owner' };
                await ensureStarterSubscriptionForUser(user.id);
            } else if (createWsError?.code === '23505') {
                const { data: owned } = await supabaseAdmin.from('workspaces').select('id').eq('owner_id', user.id).limit(1).maybeSingle();
                if (owned) workspace = { id: owned.id, role: 'owner' };
            }
            if (!workspace) {
                if (createWsError?.code === '42501') throw new Error('RLS: set SUPABASE_SERVICE_ROLE_KEY in .env to your service_role key.');
                throw createWsError || new Error('Could not create workspace');
            }
        }
        if (!workspace) return res.status(403).json({ status: 'error', code: 'NO_WORKSPACE', message: 'Create or join a workspace first' });

        const planLimits = await getWorkspacePlanAndLimits(workspace.id);
        if (planLimits && planLimits.maxJourneys != null && (planLimits.usage.journeys >= planLimits.maxJourneys)) {
            return res.status(403).json({ status: 'error', code: 'LIMIT_REACHED', limit: 'journeys' });
        }

        const { data: journey, error: insertError } = await supabaseAdmin
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
        const { data: profile } = await supabaseAdmin
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

// --- РОУТИ ДЛЯ ПЕРСОН (PERSONAS) ---

// 1. Отримати всі персони
app.get('/api/personas', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    await applyPendingInvitesForUser(user.id, user.email);

    // 1. Get accessible workspaces — use admin for reliable reads
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);

    let query = supabaseAdmin.from('personas').select('*');

    // Filter by workspace IDs
    if (workspaceIds.length > 0) {
        query = query.in('workspace_id', workspaceIds);
    } else {
        query = query.eq('user_id', user.id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch profiles to map owner names (admin so members can see workspace owner's name)
    const userIds = [...new Set(data.map(p => p.user_id).filter(Boolean))];
    let profilesMap = {};
    
    if (userIds.length > 0) {
        const { data: profiles } = await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', userIds);
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
    if (!workspace && isNewUser(user)) {
      const { data: newWorkspace, error: createWsError } = await supabaseAdmin
          .from('workspaces')
          .insert([{ owner_id: user.id, name: 'My Workspace' }])
          .select()
          .single();
      if (!createWsError && newWorkspace) {
        workspace = { id: newWorkspace.id, role: 'owner' };
        await ensureStarterSubscriptionForUser(user.id);
      } else if (createWsError?.code === '23505') {
        const { data: owned } = await supabaseAdmin.from('workspaces').select('id').eq('owner_id', user.id).limit(1).maybeSingle();
        if (owned) workspace = { id: owned.id, role: 'owner' };
      }
      if (!workspace) throw createWsError || new Error('Could not create workspace');
    }
    if (!workspace) return res.status(403).json({ status: 'error', code: 'NO_WORKSPACE', message: 'Create or join a workspace first' });

    const planLimits = await getWorkspacePlanAndLimits(workspace.id);
    if (planLimits && planLimits.maxPersonas != null && (planLimits.usage.personas >= planLimits.maxPersonas)) {
      return res.status(403).json({ status: 'error', code: 'LIMIT_REACHED', limit: 'personas' });
    }

    const { data, error } = await supabaseAdmin
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
    const { data: profile } = await supabaseAdmin
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

    const { error } = await supabaseAdmin
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

    const { data: persona } = await supabaseAdmin.from('personas').select('id, workspace_id').eq('id', id).single();
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(persona.workspace_id)) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabaseAdmin
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

    const { data: persona } = await supabaseAdmin.from('personas').select('id, workspace_id').eq('id', id).single();
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(persona.workspace_id)) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabaseAdmin
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

    const { data: persona } = await supabaseAdmin.from('personas').select('id, workspace_id').eq('id', id).single();
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

    const { data, error } = await supabaseAdmin
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
    if (!workspace && isNewUser(user)) {
      const { data: newWorkspace, error: createWsError } = await supabaseAdmin
          .from('workspaces')
          .insert([{ owner_id: user.id, name: 'My Workspace' }])
          .select()
          .single();
      if (!createWsError && newWorkspace) {
        workspace = { id: newWorkspace.id, role: 'owner' };
        await ensureStarterSubscriptionForUser(user.id);
      } else if (createWsError?.code === '23505') {
        const { data: owned } = await supabaseAdmin.from('workspaces').select('id').eq('owner_id', user.id).limit(1).maybeSingle();
        if (owned) workspace = { id: owned.id, role: 'owner' };
      }
      if (!workspace) throw createWsError || new Error('Could not create workspace');
    }
    if (!workspace) return res.status(403).json({ status: 'error', code: 'NO_WORKSPACE', message: 'Create or join a workspace first' });

    const planLimits = await getWorkspacePlanAndLimits(workspace.id);
    if (planLimits && planLimits.maxMetrics != null && (planLimits.usage.metrics >= planLimits.maxMetrics)) {
      return res.status(403).json({ status: 'error', code: 'LIMIT_REACHED', limit: 'metrics' });
    }

    const { data, error } = await supabaseAdmin
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

    const { data: metric } = await supabaseAdmin.from('metrics').select('id, workspace_id').eq('id', id).single();
    if (!metric) return res.status(404).json({ error: 'Metric not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(metric.workspace_id)) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabaseAdmin
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

    const { data: metric } = await supabaseAdmin.from('metrics').select('id, user_id, workspace_id').eq('id', id).single();
    if (!metric) return res.status(404).json({ error: 'Metric not found' });
    const workspaceIds = await getAccessibleWorkspaceIds(user.id);
    if (!workspaceIds.includes(metric.workspace_id)) return res.status(403).json({ error: 'Access denied' });
    if (metric.user_id !== user.id) return res.status(403).json({ error: 'Only the creator can delete this metric' });

    const { error } = await supabaseAdmin
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

    // Use admin for reliable reads (avoids RLS blocking on local, prevents duplicate workspace creation)
    const { data: ownedList } = await supabaseAdmin
      .from('workspaces')
      .select('id, name')
      .eq('owner_id', user.id);
    const owned = (ownedList || []).map(w => ({ id: w.id, name: w.name || 'Workspace', role: 'owner' }));

    const { data: memberRows } = await supabaseAdmin
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id);
    const ownedIds = new Set((ownedList || []).map(w => w.id));
    const memberIds = (memberRows || []).map(m => m.workspace_id).filter(id => id && !ownedIds.has(id));
    let member = [];
    if (memberIds.length > 0) {
      const { data: wsList } = await supabaseAdmin.from('workspaces').select('id, name').in('id', memberIds);
      const roleByWs = Object.fromEntries((memberRows || []).map(m => [m.workspace_id, m.role || 'member']));
      member = (wsList || []).map(w => ({ id: w.id, name: w.name || 'Workspace', role: roleByWs[w.id] || 'member' }));
    }

    let list = [...owned, ...member];

    // If no workspace yet, create default only for new users (not for removed members).
    if (list.length === 0 && isNewUser(user)) {
      // Re-check before create (avoids race when multiple requests run in parallel)
      const recheck = await getAccessibleWorkspaceIds(user.id);
      if (recheck.length > 0) {
        const { data: ow } = await supabaseAdmin.from('workspaces').select('id, name').eq('owner_id', user.id);
        list = (ow || []).map(w => ({ id: w.id, name: w.name || 'Workspace', role: 'owner' }));
        const { data: mb } = await supabaseAdmin.from('workspace_members').select('workspace_id, role').eq('user_id', user.id);
        const ownedIds = new Set(list.map(w => w.id));
        const memberIds = (mb || []).map(m => m.workspace_id).filter(id => id && !ownedIds.has(id));
        if (memberIds.length > 0) {
          const { data: wl } = await supabaseAdmin.from('workspaces').select('id, name').in('id', memberIds);
          const roleByWs = Object.fromEntries((mb || []).map(m => [m.workspace_id, m.role || 'member']));
          list = [...list, ...(wl || []).map(w => ({ id: w.id, name: w.name || 'Workspace', role: roleByWs[w.id] || 'member' }))];
        }
      } else {
      const { data: newWorkspace, error: createErr } = await supabaseAdmin
        .from('workspaces')
        .insert([{ owner_id: user.id, name: 'My Workspace' }])
        .select('id, name')
        .single();
      if (!createErr && newWorkspace) {
        list = [{ id: newWorkspace.id, name: newWorkspace.name || 'My Workspace', role: 'owner' }];
        await ensureStarterSubscriptionForUser(user.id);
      } else if (createErr?.code === '23505') {
        const { data: ownedAgain } = await supabaseAdmin.from('workspaces').select('id, name').eq('owner_id', user.id);
        list = (ownedAgain || []).map(w => ({ id: w.id, name: w.name || 'Workspace', role: 'owner' }));
        await ensureStarterSubscriptionForUser(user.id);
      } else if (createErr?.code === '42501') {
        console.error('Tip: set SUPABASE_SERVICE_ROLE_KEY in .env to your project’s service_role key (Supabase Dashboard → Settings → API).');
      }
      }
    }

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

    // 1. Try to find owned workspace — use admin for reliable reads
    let { data: workspace, error } = await supabaseAdmin
      .from('workspaces')
      .select('*')
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle();

    let role = 'owner';

    // 2. If not owner, try to apply any pending invites then check membership
    if (!workspace) {
        await applyPendingInvitesForUser(user.id, user.email);
        const { data: memberRecord } = await supabaseAdmin
            .from('workspace_members')
            .select('workspace_id, role')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle();

        if (memberRecord) {
            const { data: ws } = await supabaseAdmin
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
        const { data: ws } = await supabaseAdmin.from('workspaces').select('id, owner_id').eq('id', workspaceIdParam).maybeSingle();
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
    const { data: wsRow } = await supabaseAdmin.from('workspaces').select('id').eq('id', bodyWorkspaceId).eq('owner_id', user.id).maybeSingle();
    if (!wsRow) return res.status(403).json({ status: 'error', message: 'Only workspace owner can update name' });

    const { data, error } = await supabaseAdmin
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

    const { data: ws } = await supabaseAdmin.from('workspaces').select('id').eq('id', workspaceId).eq('owner_id', user.id).maybeSingle();
    if (!ws) return res.status(403).json({ status: 'error', message: 'Only workspace owner can delete it' });

    await supabaseAdmin.from('workspace_invites').delete().eq('workspace_id', workspaceId);
    await supabaseAdmin.from('workspace_members').delete().eq('workspace_id', workspaceId);
    await supabaseAdmin.from('journeys').delete().eq('workspace_id', workspaceId);
    await supabaseAdmin.from('personas').delete().eq('workspace_id', workspaceId);
    await supabaseAdmin.from('metrics').delete().eq('workspace_id', workspaceId);
    const { error: delErr } = await supabaseAdmin.from('workspaces').delete().eq('id', workspaceId);

    if (delErr) throw delErr;
    res.json({ status: 'success', message: 'Workspace deleted' });
  } catch (err) {
    logSystemError(err, 'DELETE /api/workspace');
    console.error('Error deleting workspace:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- WORKSPACE MEMBERS (for journey owner dropdown, any workspace member can call) ---
app.get('/api/workspace/members', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { workspaceId } = req.query;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ status: 'error', message: 'workspaceId required' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

        const workspaceIds = await getAccessibleWorkspaceIds(user.id);
        if (!workspaceIds.includes(workspaceId)) return res.status(403).json({ status: 'error', message: 'Access denied' });

        const { data: workspace, error: wsErr } = await supabaseAdmin.from('workspaces').select('id, owner_id').eq('id', workspaceId).maybeSingle();
        if (wsErr || !workspace) return res.status(404).json({ status: 'error', message: 'Workspace not found' });

        const { data: members, error: membersError } = await supabaseAdmin
            .from('workspace_members')
            .select('user_id')
            .eq('workspace_id', workspace.id);
        if (membersError) throw membersError;

        const userIds = [...new Set([
            workspace.owner_id,
            ...(members || []).map(m => m.user_id).filter(Boolean)
        ])].filter(Boolean);

        let profilesMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await supabaseAdmin.from('profiles').select('id, email, full_name').in('id', userIds);
            if (profiles) profiles.forEach(p => { profilesMap[p.id] = p; });
        }
        const missing = userIds.filter(id => !profilesMap[id]?.full_name && !profilesMap[id]?.email);
        let authMap = {};
        if (missing.length > 0) {
            const authResults = await Promise.all(missing.map(id => supabase.auth.admin.getUserById(id)));
            authResults.forEach((r, i) => {
                const uid = missing[i];
                const u = r.data?.user;
                if (u) authMap[uid] = { email: u.email || null, full_name: u.user_metadata?.full_name || null };
            });
        }

        const list = userIds.map(uid => {
            const p = profilesMap[uid] || {};
            const a = authMap[uid] || {};
            return { id: uid, full_name: p.full_name ?? a.full_name ?? null, email: p.email ?? a.email ?? null };
        });

        res.json({ status: 'success', data: list });
    } catch (err) {
        console.error('Error fetching workspace members:', err);
        logSystemError(err, 'GET /api/workspace/members');
        res.status(500).json({ status: 'error', error: err.message });
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

        // Get workspace ID specifically — use admin for reliable read
        const { data: workspace } = await supabaseAdmin.from('workspaces')
            .select('id')
            .eq('owner_id', user.id)
            .eq('id', workspaceId)
            .single();
        
        if (!workspace) return res.status(403).json({ error: 'Only workspace owners can view team settings' });

        // Get Members (без join на profiles — FK може відсутній) — admin for reliable read
        const { data: members, error: membersError } = await supabaseAdmin
            .from('workspace_members')
            .select('id, role, joined_at, user_id')
            .eq('workspace_id', workspace.id);

        if (membersError) throw membersError;

        // Окремо підтягуємо profiles за user_id
        const userIds = [...new Set((members || []).map(m => m.user_id).filter(Boolean))];
        let profilesMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await supabaseAdmin
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
        const { data: invites, error: invitesError } = await supabaseAdmin
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
        
        // Use admin for reliable read (avoids RLS blocking on local)
        const { data: workspace } = await supabaseAdmin.from('workspaces')
            .select('id')
            .eq('owner_id', user.id)
            .eq('id', targetWorkspaceId)
            .single();
        
        if (!workspace) return res.status(403).json({ error: 'Only owners can invite' });

        const planLimits = await getWorkspacePlanAndLimits(workspace.id);
        if (planLimits && planLimits.maxMembers != null && (planLimits.usage.members >= planLimits.maxMembers)) {
            return res.status(403).json({ status: 'error', code: 'LIMIT_REACHED', limit: 'members' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        // Use admin so we always find existing row (e.g. re-invite after member was removed; RLS could hide accepted invites)
        const { data: existingInvite } = await supabaseAdmin
            .from('workspace_invites')
            .select('id, status')
            .eq('workspace_id', workspace.id)
            .ilike('email', normalizedEmail)
            .maybeSingle();

        if (existingInvite) {
            if (existingInvite.status === 'pending') {
                return res.json({ status: 'success', message: 'Invite already sent to this email.', data: { id: existingInvite.id } });
            }
            // Re-invite: update existing row (e.g. was accepted/rejected, or member was removed) to pending so we don't hit unique constraint
            const { data: updated, error: updateErr } = await supabaseAdmin
                .from('workspace_invites')
                .update({ status: 'pending', role })
                .eq('id', existingInvite.id)
                .select()
                .single();
            if (updateErr) throw updateErr;
            console.log(`📧 [MOCK EMAIL] Re-sending invite to ${email} for workspace ${workspace.id}`);
            return res.json({ status: 'success', message: 'Invite sent successfully.', data: updated });
        }

        const { data, error } = await supabaseAdmin
            .from('workspace_invites')
            .insert([{ workspace_id: workspace.id, email: normalizedEmail, role }])
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
        const { data: invite } = await supabaseAdmin.from('workspace_invites')
            .select('id, workspace_id')
            .eq('id', inviteId)
            .single();
        if (!invite) return res.status(404).json({ error: 'Invite not found' });

        const { data: workspace } = await supabaseAdmin.from('workspaces')
            .select('id')
            .eq('id', invite.workspace_id)
            .eq('owner_id', user.id)
            .single();
        if (!workspace) return res.status(403).json({ error: 'Only workspace owner can cancel invites' });

        const { error } = await supabaseAdmin
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
        const { data: member } = await supabaseAdmin.from('workspace_members')
            .select('id, workspace_id')
            .eq('id', memberRowId)
            .single();
        if (!member) return res.status(404).json({ error: 'Member not found' });

        const { data: workspace } = await supabaseAdmin.from('workspaces')
            .select('id')
            .eq('id', member.workspace_id)
            .eq('owner_id', user.id)
            .single();
        if (!workspace) return res.status(403).json({ error: 'Only workspace owner can remove members' });

        const { error } = await supabaseAdmin
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

    // Отримуємо додаткові дані з таблиці profiles (admin — сервер без JWT контексту)
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    
    // Auto-create profile only when row truly missing — never overwrite existing full_name
    if (!profile) {
        const fullName = (user.user_metadata?.full_name || (user.email && user.email.split('@')[0]) || '').trim() || 'User';
        const { data: inserted, error: insertErr } = await supabaseAdmin
            .from('profiles')
            .insert({ id: user.id, email: user.email || '', full_name: fullName })
            .select()
            .maybeSingle();
        if (!insertErr && inserted) {
            profile = inserted;
        } else if (insertErr?.code === '23505') {
            // Row exists (e.g. race) — fetch existing so we never overwrite name
            const { data: existing } = await supabaseAdmin.from('profiles').select('*').eq('id', user.id).maybeSingle();
            if (existing) profile = existing;
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
        avatar_color: profile?.avatar_color || 'bg-blue-100 text-blue-600',
    };

    res.json({ status: 'success', data });
  } catch (err) {
    logSystemError(err, 'GET /api/profile');
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: err.message });
  }
});

// Оновити профіль (ім'я, колір аватара)
app.put('/api/profile', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

  const { full_name, avatar_color } = req.body;

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ status: 'error', message: 'Invalid token' });

    const payload = { id: user.id, full_name };
    if (avatar_color !== undefined) payload.avatar_color = avatar_color;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .upsert(payload)
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
    const { data: list, error } = await supabaseAdmin
      .from('feedback')
      .select('id, type, subject, status, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const ids = (list || []).map((f) => f.id);
    if (ids.length === 0) return res.json({ status: 'success', data: list || [] });
    const { data: replyCounts } = await supabaseAdmin
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
    const { data: myFeedback } = await supabaseAdmin.from('feedback').select('id').eq('user_id', user.id);
    const ids = (myFeedback || []).map((f) => f.id);
    if (ids.length === 0) return res.json({ status: 'success', data: 0 });
    const { count, error } = await supabaseAdmin
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
    const { data: feedback, error: feedError } = await supabaseAdmin
      .from('feedback')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (feedError || !feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { data: replies, error: repError } = await supabaseAdmin
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
    const { data: feedback } = await supabaseAdmin.from('feedback').select('id').eq('id', id).eq('user_id', user.id).single();
    if (!feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { error: updateErr } = await supabaseAdmin
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
    const { data: feedback } = await supabaseAdmin.from('feedback').select('id').eq('id', id).eq('user_id', user.id).single();
    if (!feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { error: delError } = await supabaseAdmin.from('feedback').delete().eq('id', id);
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
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
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
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ status: 'error', message: 'Access denied' });
    const { count: total, error: totalErr } = await supabaseAdmin.from('feedback').select('*', { count: 'exact', head: true });
    if (totalErr) throw totalErr;
    const { count: open, error: openErr } = await supabaseAdmin.from('feedback').select('*', { count: 'exact', head: true }).eq('status', 'open');
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
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ status: 'error', message: 'Access denied' });
    const { id } = req.params;
    const { data: feedback, error: feedError } = await supabaseAdmin.from('feedback').select('*').eq('id', id).single();
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
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ status: 'error', message: 'Access denied' });
    const { id } = req.params;
    const { body } = req.body;
    if (!body || !String(body).trim()) return res.status(400).json({ status: 'error', message: 'body required' });
    const { data: feedback } = await supabaseAdmin.from('feedback').select('id').eq('id', id).single();
    if (!feedback) return res.status(404).json({ status: 'error', message: 'Not found' });
    const { data: reply, error } = await supabaseAdmin
      .from('feedback_replies')
      .insert([{ feedback_id: id, author_type: 'admin', author_id: user.id, body: String(body).trim() }])
      .select()
      .single();
    if (error) throw error;
    await supabaseAdmin.from('feedback').update({ status: 'replied', updated_at: new Date().toISOString() }).eq('id', id);
    res.status(201).json({ status: 'success', data: reply });
  } catch (err) {
    logSystemError(err, 'POST /api/admin/feedback/:id/reply');
    console.error('Error posting admin reply:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// --- РОУТИ ДЛЯ ПІДПИСОК (SUBSCRIPTIONS) ---

// 1. Отримати активні плани (публічний). ?locale=en|uk — features from features_by_locale
app.get('/api/plans', async (req, res) => {
    try {
        const locale = (req.query.locale || 'en').toLowerCase();
        const { data, error } = await supabase
            .from('plans')
            .select('*')
            .eq('is_active', true)
            .order('tier', { ascending: true });

        if (error) throw error;
        const plans = (data || []).map((plan) => {
            const byLocale = plan.features_by_locale || {};
            const features = (byLocale[locale] != null ? byLocale[locale] : byLocale.en) ?? plan.features ?? [];
            const byDesc = plan.description_by_locale || {};
            const description = (byDesc[locale] != null ? byDesc[locale] : byDesc.en) ?? plan.description ?? '';
            return { ...plan, features, description };
        });
        res.json({ status: 'success', data: plans });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ensure current user has Starter subscription (for new registrations via client signUp). Use admin client so RLS does not block.
app.post('/api/subscriptions/ensure-starter', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

        const { data: existing } = await supabaseAdmin
            .from('subscriptions')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        if (existing) return res.status(200).json({ status: 'ok', message: 'Already has subscription' });

        const { data: starterPlan } = await supabaseAdmin
            .from('plans')
            .select('id')
            .ilike('name', 'Starter')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
        if (!starterPlan) return res.status(500).json({ error: 'Starter plan not found' });

        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        const { error: subInsertErr } = await supabaseAdmin.from('subscriptions').insert([{
            user_id: user.id,
            plan_id: starterPlan.id,
            status: 'active',
            current_period_start: new Date(),
            current_period_end: periodEnd,
        }]);
        if (subInsertErr) throw subInsertErr;
        return res.status(200).json({ status: 'ok', message: 'Starter assigned' });
    } catch (err) {
        console.error('ensure-starter error:', err);
        return res.status(500).json({ error: err.message });
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
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
        
        if (profile?.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Деактивуємо старі підписки
        await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'canceled', current_period_end: new Date() })
            .eq('user_id', userId)
            .neq('status', 'canceled');

        // Створюємо нову
        const { data, error } = await supabaseAdmin
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

        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'admin') {
            console.log(`❌ Access denied for user ${user.id} (role: ${profile?.role})`);
            return res.status(403).json({
                error: 'Access denied',
                message: "Your account needs role 'admin' in the profiles table to view user details.",
            });
        }

        // 1. Profile
        const { data: userProfile, error: profileError } = await supabaseAdmin
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
        const { data: ownedWorkspaces } = await supabaseAdmin
            .from('workspaces')
            .select('*, workspace_members(count)')
            .eq('owner_id', id);
        
        const { data: joinedWorkspaces } = await supabaseAdmin
            .from('workspace_members')
            .select('role, joined_at, workspaces(*)')
            .eq('user_id', id);

        // 3. Subscriptions (History)
        const { data: subscriptions } = await supabaseAdmin
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
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
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
        await supabaseAdmin.from('subscriptions').update({ status: 'canceled' }).eq('user_id', userId).eq('status', 'active');

        const { data, error } = await supabaseAdmin.from('subscriptions').insert([{ user_id: userId, plan_id: planId, status: 'active', current_period_start: new Date(), current_period_end: endDate }]).select().single();
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