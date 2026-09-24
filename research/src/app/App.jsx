import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LogOut, Layers3, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../../client/src/supabaseClient';
import { useResearchQuery, researchRequest } from '../hooks/useResearch';
import { Brand, ErrorState, LanguageSwitch, Loading } from '../components/UI';
import AuthPage from '../pages/AuthPage';
import StudiesPage from '../pages/StudiesPage';
import StudyPage from '../pages/StudyPage';
import InterviewPage from '../pages/InterviewPage';
import { useConfirmUnsavedChanges } from '../hooks/useUnsavedChanges';

const ResearchContext = createContext(null);
export const useResearchContext = () => useContext(ResearchContext);

export default function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const confirmLeave = useConfirmUnsavedChanges();
  const [session, setSession] = useState(undefined);
  const [recovery, setRecovery] = useState(() => new URLSearchParams(window.location.search).get('flow') === 'recovery' || window.location.hash.includes('type=recovery'));
  const [workspaceId, setWorkspaceId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState(null);
  const lastUser = useRef(undefined);
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
  const workspacesQuery = useResearchQuery(user?.id, null, ['workspaces'], '/workspaces', Boolean(user && !recovery));
  const workspaces = workspacesQuery.data || [];
  const selectedWorkspace = workspaces.find((item) => item.id === workspaceId) || workspaces[0];
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
    else { queryClient.clear(); setSession(null); navigate('/'); }
    setBusy(false);
  };
  if (session === undefined) return <div className="app-shell-bg min-h-screen"><Loading /></div>;
  if (!user || recovery) return <AuthPage recovery={recovery} onRecovered={() => { setRecovery(false); window.history.replaceState(null, '', '/'); navigate('/'); }} />;
  return <ResearchContext.Provider value={{ user, workspace: selectedWorkspace }}><div className="app-shell-bg min-h-screen"><header className="sticky top-0 z-30 border-b border-white/70 bg-white/75 backdrop-blur-xl"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8"><Link to="/" aria-label={t('research.researchHome')}><Brand /></Link><div className="flex flex-wrap items-center gap-3">{workspaces.length > 0 && <label className="flex items-center gap-2"><Layers3 size={15} className="text-slate-400" /><span className="sr-only">{t('research.workspace')}</span><select data-testid="research-workspace" className="max-w-48 rounded-lg border-0 bg-transparent py-2 text-sm font-semibold text-slate-600" value={selectedWorkspace.id} onChange={(event) => { if (!confirmLeave()) return; setWorkspaceId(event.target.value); navigate('/'); }}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<LanguageSwitch /><button aria-label={t('research.signOut')} title={`${user.email} · ${t('research.signOut')}`} disabled={busy} onClick={signOut} className="rounded-xl border border-slate-200 bg-white/70 p-2.5 text-slate-500 hover:text-slate-950"><LogOut size={16} /></button></div></div></header><main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10"><div className="mb-8 flex items-start gap-3 rounded-2xl border border-blue-100/80 bg-blue-50/60 px-4 py-3 text-xs leading-5 text-blue-800"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" /><p><strong className="mr-2">{t('research.beta')}</strong>{t('research.previewNote')}</p></div>{mutationError && <div className="mb-6"><ErrorState error={mutationError} /></div>}{workspacesQuery.isPending ? <Loading /> : workspacesQuery.isError ? <ErrorState error={workspacesQuery.error} onRetry={() => workspacesQuery.refetch()} /> : !selectedWorkspace ? <section className="app-surface mx-auto max-w-xl rounded-3xl p-8"><div className="research-eyebrow">{t('research.workspace')}</div><h1 className="mt-3 text-3xl font-bold tracking-tight">{t('research.noWorkspace')}</h1><p className="mt-4 text-sm leading-7 text-slate-500">{t('research.workspaceIntro')}</p><form onSubmit={bootstrap} className="mt-7 space-y-5"><label className="block"><span className="research-label">{t('research.workspaceName')}</span><input name="name" maxLength={150} required defaultValue={t('research.workspaceDefault')} className="research-field" /></label><button disabled={busy} className="research-primary" data-testid="research-bootstrap">{t(busy ? 'research.saving' : 'research.newWorkspace')}<ArrowUpRight size={16} /></button></form></section> : <Routes key={`${user.id}:${selectedWorkspace.id}`}><Route path="/" element={<StudiesPage />} /><Route path="/studies/:studyId" element={<StudyPage />} /><Route path="/studies/:studyId/interviews/:interviewId" element={<InterviewPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>}</main></div></ResearchContext.Provider>;
}
