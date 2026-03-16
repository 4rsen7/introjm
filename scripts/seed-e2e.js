const path = require('path');
const { createClient } = require(path.join(__dirname, '../server/node_modules/@supabase/supabase-js'));

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const defaults = {
  ownerWorkspace: process.env.E2E_OWNER_WORKSPACE || 'E2E Owner Workspace',
  memberWorkspace: process.env.E2E_MEMBER_PERSONAL_WORKSPACE || 'E2E Member Workspace',
  sharedWorkspace: process.env.E2E_MEMBER_SHARED_WORKSPACE || 'E2E Shared Workspace',
  sharedInterviewTitle: process.env.E2E_SHARED_INTERVIEW_TITLE || 'E2E Shared Interview',
  ownerJourneyTitle: process.env.E2E_OWNER_JOURNEY_TITLE || 'E2E Owner Journey',
  ownerPersonaName: process.env.E2E_OWNER_PERSONA_NAME || 'E2E Owner Persona',
  ownerMetricName: process.env.E2E_OWNER_METRIC_NAME || 'E2E Owner Metric',
};

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function findAuthUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((user) => String(user.email || '').toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.length < 200) return null;
    page += 1;
  }
}

async function ensureAuthUser({ email, password, fullName, role }) {
  let user = await findAuthUserByEmail(email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(user.user_metadata || {}), full_name: fullName },
    });
    if (error) throw error;
    user = data.user;
  }

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: user.id,
    email,
    full_name: fullName,
    role,
  });
  if (profileError) throw profileError;

  return user;
}

async function ensureWorkspace(ownerId, name) {
  const { data: existing, error: fetchError } = await supabase
    .from('workspaces')
    .select('id, owner_id, name')
    .eq('owner_id', ownerId)
    .eq('name', name)
    .limit(1)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('workspaces')
    .insert([{ owner_id: ownerId, name }])
    .select('id, owner_id, name')
    .single();
  if (error) throw error;
  return data;
}

async function ensureWorkspaceMember(workspaceId, userId, role = 'member') {
  const { data: existing, error: fetchError } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('workspace_members')
    .insert([{ workspace_id: workspaceId, user_id: userId, role }])
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

async function ensureStarterSubscription(userId) {
  const { data: existing, error: existingError } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: starterPlan, error: planError } = await supabase
    .from('plans')
    .select('id')
    .ilike('name', 'Starter')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (planError) throw planError;
  if (!starterPlan) return null;

  const currentPeriodStart = new Date();
  const currentPeriodEnd = new Date(currentPeriodStart);
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

  const { data, error } = await supabase
    .from('subscriptions')
    .insert([{
      user_id: userId,
      plan_id: starterPlan.id,
      status: 'active',
      current_period_start: currentPeriodStart.toISOString(),
      current_period_end: currentPeriodEnd.toISOString(),
    }])
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

async function ensureJourney({ workspaceId, userId, title }) {
  const { data: existing, error: fetchError } = await supabase
    .from('journeys')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('title', title)
    .limit(1)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('journeys')
    .insert([{
      title,
      description: 'Seeded for E2E smoke tests',
      status: 'draft',
      user_id: userId,
      workspace_id: workspaceId,
      updated_at: new Date().toISOString(),
    }])
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

async function ensurePersona({ workspaceId, userId, name }) {
  const { data: existing, error: fetchError } = await supabase
    .from('personas')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', name)
    .limit(1)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('personas')
    .insert([{
      name,
      role: 'Service Designer',
      description: 'Seeded persona for E2E smoke tests',
      user_id: userId,
      workspace_id: workspaceId,
      status: 'active',
      goals: ['Validate key flows'],
      frustrations: ['Unexpected regressions'],
      updated_at: new Date().toISOString(),
    }])
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

async function ensureMetric({ workspaceId, userId, name }) {
  const { data: existing, error: fetchError } = await supabase
    .from('metrics')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', name)
    .limit(1)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('metrics')
    .insert([{
      name,
      type: 'Number',
      value: 42,
      previous_value: 40,
      suffix: '%',
      user_id: userId,
      workspace_id: workspaceId,
      updated_at: new Date().toISOString(),
    }])
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

async function ensureInterview({ workspaceId, userId, title }) {
  const { data: existing, error: fetchError } = await supabase
    .from('interviews')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('title', title)
    .limit(1)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('interviews')
    .insert([{
      title,
      status: 'draft',
      type: 'upload',
      transcript_data: [{ speaker: 'Respondent', text: 'Seeded interview transcript' }],
      user_id: userId,
      workspace_id: workspaceId,
    }])
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

async function main() {
  if (process.env.E2E_AUTH_EMAIL && process.env.E2E_AUTH_PASSWORD) {
    await ensureAuthUser({
      email: process.env.E2E_AUTH_EMAIL,
      password: process.env.E2E_AUTH_PASSWORD,
      fullName: 'E2E Auth',
      role: 'user',
    });
  }

  const owner = await ensureAuthUser({
    email: requiredEnv('E2E_OWNER_EMAIL'),
    password: requiredEnv('E2E_OWNER_PASSWORD'),
    fullName: 'E2E Owner',
    role: 'user',
  });

  const ownerWorkspace = await ensureWorkspace(owner.id, defaults.ownerWorkspace);
  const sharedWorkspace = await ensureWorkspace(owner.id, defaults.sharedWorkspace);
  await ensureStarterSubscription(owner.id);

  await ensureJourney({ workspaceId: ownerWorkspace.id, userId: owner.id, title: defaults.ownerJourneyTitle });
  await ensurePersona({ workspaceId: ownerWorkspace.id, userId: owner.id, name: defaults.ownerPersonaName });
  await ensureMetric({ workspaceId: ownerWorkspace.id, userId: owner.id, name: defaults.ownerMetricName });

  if (process.env.E2E_MEMBER_EMAIL && process.env.E2E_MEMBER_PASSWORD) {
    const member = await ensureAuthUser({
      email: process.env.E2E_MEMBER_EMAIL,
      password: process.env.E2E_MEMBER_PASSWORD,
      fullName: 'E2E Member',
      role: 'user',
    });

    const memberWorkspace = await ensureWorkspace(member.id, defaults.memberWorkspace);
    await ensureStarterSubscription(member.id);
    await ensureWorkspaceMember(sharedWorkspace.id, member.id, 'member');
    await ensureInterview({ workspaceId: sharedWorkspace.id, userId: owner.id, title: defaults.sharedInterviewTitle });
    await ensureInterview({ workspaceId: memberWorkspace.id, userId: member.id, title: 'E2E Member Private Interview' });
  }

  if (process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD) {
    await ensureAuthUser({
      email: process.env.E2E_ADMIN_EMAIL,
      password: process.env.E2E_ADMIN_PASSWORD,
      fullName: 'E2E Admin',
      role: 'admin',
    });
  }

  console.log('E2E seed ready.');
  console.log(`Owner workspace: ${defaults.ownerWorkspace}`);
  console.log(`Shared workspace: ${defaults.sharedWorkspace}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
