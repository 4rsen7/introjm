import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LogOut, Layers3, ArrowUpRight, Settings } from 'lucide-react';
import { supabase } from '../../../client/src/supabaseClient';
import { useResearchQuery, researchKey, researchRequest } from '../hooks/useResearch';
import { Brand, ErrorState, LanguageSwitch, Loading } from '../components/UI';
import HeaderSelect from '../components/HeaderSelect';
import AuthPage from '../pages/AuthPage';
import StudiesPage from '../pages/StudiesPage';
import StudyPage from '../pages/StudyPage';
import InterviewPage from '../pages/InterviewPage';
import SettingsPanel from '../components/SettingsPanel';
import { useConfirmUnsavedChanges } from '../hooks/useUnsavedChanges';

const ResearchContext = createContext(null);
export const useResearchContext = () => useContext(ResearchContext);

function invitationTokenFromUrl() {
  const token = new URLSearchParams(window.location.search).get('invite') || /^\/(?:research\/)?invite\/([0-9a-f]{64})\/?$/i.exec(window.location.pathname)?.[1];
  return /^[0-9a-f]{64}$/i.test(token || '') ? token.toLowerCase() : null;
}

function clearInvitationUrl() {
  if (new URLSearchParams(window.location.search).has('invite') || /\/(?:research\/)?invite\//.test(window.location.pathname)) window.history.replaceState(null, '', '/');
}

export default function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const previousPath = useRef(pathname);
  useLayoutEffect(() => {
    if (previousPath.current !== pathname && navigationType !== 'POP') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
    previousPath.current = pathname;
  }, [pathname, navigationType]);
  const confirmLeave = useConfirmUnsavedChanges();
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(() => new URLSearchParams(window.location.search).get('flow') === 'recovery' || window.location.hash.includes('type=recovery'));
  const [workspaceId, setWorkspaceId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState(invitationTokenFromUrl);
  const [inviteState, setInviteState] = useState('idle');
  const [inviteError, setInviteError] = useState(null);
  const [inviteRetry, setInviteRetry] = useState(0);
  const inviteAttempt = useRef(null);
  const lastUser = useRef(undefined);
  useEffect(() => {
    if (!inviteToken) return undefined;
    let meta = document.querySelector('meta[name="referrer"]');
    const created = !meta;
    if (!meta) { meta = document.createElement('meta'); meta.name = 'referrer'; document.head.appendChild(meta); }
    const previous = meta.content;
    meta.content = 'no-referrer';
    return () => { if (created) meta.remove(); else meta.content = previous; };
  }, [inviteToken]);
  useEffect(() => {
    let active = true;
    const applySession = (next) => {
      if (!active) return;
      const nextId = next?.user?.id || null;
      if (lastUser.current !== nextId) { queryClient.clear(); setWorkspaceId(null); lastUser.current = nextId; }
      setSession(next);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => { if (event === 'PASSWORD_RECOVERY') setRecovery(true); applySession(next); });
    supabase.auth.getSession().then(({ data }) => applySession(data.session)).catch(() => applySession(null));
    return () => { active = false; subscription.unsubscribe(); };
  }, [queryClient]);
  const user = session?.user;
  const headerRef = useRef(null);
  const showHeader = Boolean(user) && !recovery;
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return undefined;
    const updateHeight = () => document.documentElement.style.setProperty('--research-header-height', `${header.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--research-header-height'); };
  }, [showHeader]);
  const workspacesQuery = useResearchQuery(user?.id, null, ['workspaces'], '/workspaces', Boolean(user && !recovery));
  const workspaces = workspacesQuery.data || [];
  const selectedWorkspace = workspaces.find((item) => item.id === workspaceId) || workspaces[0];
  useEffect(() => {
    if (!user?.id || !inviteToken || recovery || inviteAttempt.current === `${user.id}:${inviteToken}`) return;
    let active = true;
    inviteAttempt.current = `${user.id}:${inviteToken}`;
    setInviteState('accepting'); setInviteError(null);
    researchRequest(`/invites/${inviteToken}/accept`, { method: 'POST' }).then(async result => {
      if (!active) return;
      setWorkspaceId(result.workspace_id);
      // An initial request may still contain membership from before invitation acceptance.
      await queryClient.cancelQueries({ queryKey: researchKey(user.id, null, 'workspaces'), exact: true });
      if (!active) return;
      await workspacesQuery.refetch({ throwOnError: true });
      if (!active) return;
      clearInvitationUrl();
      setInviteToken(null); setInviteState('idle');
      navigate('/', { replace: true });
    }).catch(error => { if (active) { setInviteError(error); setInviteState('error'); } });
    return () => { active = false; };
  }, [user?.id, inviteToken, recovery, inviteRetry, workspacesQuery.refetch, queryClient, navigate]);
  const bootstrap = async (event) => {
    event.preventDefault(); setBusy(true); setMutationError(null);
    try {
      const workspace = await researchRequest('/bootstrap', { method: 'POST', body: JSON.stringify({ name: new FormData(event.currentTarget).get('name') }) });
      await workspacesQuery.refetch(); setWorkspaceId(workspace.id);
    } catch (error) { setMutationError(error); } finally { setBusy(false); }
  };
  const signOut = async () => {
    if (!confirmLeave()) return;
    setBusy(true); setMutationError(null);
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) setMutationError(error);
    else { queryClient.clear(); setSession(null); navigate(inviteToken ? `/?invite=${inviteToken}` : '/'); }
    setBusy(false);
  };
  if (session === undefined) return <div className="app-shell-bg min-h-screen"><Loading /></div>;
  if (!user || recovery) return <AuthPage inviteToken={inviteToken} recovery={recovery} onRecovered={() => { setRecovery(false); const destination = inviteToken ? `/?invite=${inviteToken}` : '/'; window.history.replaceState(null, '', destination); navigate(destination); }} />;
  return <ResearchContext.Provider value={{ user, workspace: selectedWorkspace }}><div className="app-shell-bg min-h-screen"><header ref={headerRef} className="research-app-header sticky top-0 z-30 border-b border-white/70 bg-white/75 backdrop-blur-xl"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8"><Link to="/" aria-label={t('research.researchHome')}><Brand /></Link><div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:gap-3">{workspaces.length > 0 && <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:min-w-[16rem] sm:max-w-[24rem] sm:flex-1"><Layers3 size={15} className="hidden shrink-0 text-slate-400 sm:block" />{workspaces.length === 1 ? <div data-testid="research-workspace" aria-label={t('research.workspace')} title={selectedWorkspace.name} className="research-header-workspace-static"><span className="min-w-0 truncate">{selectedWorkspace.name}</span></div> : <HeaderSelect label={t('research.workspace')} value={selectedWorkspace.id} options={workspaces.map(item => ({ value: item.id, label: item.name, meta: t(`research.${item.role === 'owner' ? 'owner' : 'member'}`) }))} onChange={nextId => { if (!confirmLeave()) return; setWorkspaceId(nextId); navigate('/'); }} testId="research-workspace" />}</div>}{selectedWorkspace?.role === 'owner' && <button type="button" className="research-secondary !px-3 sm:!px-4" aria-label={t('research.settingsTitle')} title={t('research.settingsTitle')} onClick={() => setSettingsOpen(true)}><Settings size={16} /><span className="hidden sm:inline">{t('research.settingsTitle')}</span></button>}<LanguageSwitch /><button type="button" aria-label={t('research.signOut')} title={`${user.email} · ${t('research.signOut')}`} disabled={busy} onClick={signOut} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/70 text-slate-500 shadow-sm hover:text-slate-950"><LogOut size={16} /></button></div></div></header><main className="mx-auto max-w-[1440px] px-4 pb-16 pt-7 sm:px-8 sm:pt-9">{mutationError && <div className="mb-6"><ErrorState error={mutationError} /></div>}{inviteToken ? <section className="app-surface mx-auto max-w-xl rounded-3xl p-8" data-testid="research-invite-gate"><h1 className="text-2xl font-bold">{t('research.joinWorkspace')}</h1><p className="mt-3 text-sm text-slate-500">{t('research.inviteAccount', { email: user.email })}</p>{inviteState === 'error' ? <div className="mt-5"><ErrorState error={inviteError} /><div className="mt-4 flex gap-3"><button type="button" className="research-secondary" onClick={() => { inviteAttempt.current = null; setInviteState('idle'); setInviteRetry(value => value + 1); }}>{t('research.retry')}</button><button type="button" className="research-secondary" onClick={signOut}>{t('research.signOut')}</button></div></div> : <Loading />}</section> : workspacesQuery.isPending ? <Loading /> : workspacesQuery.isError ? <ErrorState error={workspacesQuery.error} onRetry={() => workspacesQuery.refetch()} /> : !selectedWorkspace ? <section className="app-surface mx-auto max-w-xl rounded-3xl p-8"><div className="research-eyebrow">{t('research.workspace')}</div><h1 className="mt-3 text-3xl font-bold tracking-tight">{t('research.noWorkspace')}</h1><p className="mt-4 text-sm leading-7 text-slate-500">{t('research.workspaceIntro')}</p><form onSubmit={bootstrap} className="mt-7 space-y-5"><label className="block"><span className="research-label">{t('research.workspaceName')}</span><input name="name" maxLength={150} required defaultValue={t('research.workspaceDefault')} className="research-field" /></label><button disabled={busy} className="research-primary" data-testid="research-bootstrap">{t(busy ? 'research.saving' : 'research.newWorkspace')}<ArrowUpRight size={16} /></button></form></section> : <Routes key={`${user.id}:${selectedWorkspace.id}`}><Route path="/" element={<StudiesPage />} /><Route path="/studies/:studyId" element={<StudyPage />} /><Route path="/studies/:studyId/interviews/:interviewId" element={<InterviewPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>}</main>{settingsOpen && selectedWorkspace?.role === 'owner' && <SettingsPanel key={selectedWorkspace.id} userId={user.id} workspace={selectedWorkspace} onClose={() => setSettingsOpen(false)} onWorkspaceUpdated={() => workspacesQuery.refetch()} />}</div></ResearchContext.Provider>;
}
