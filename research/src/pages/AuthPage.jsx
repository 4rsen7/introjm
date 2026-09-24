import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ArrowUpRight, Loader2 } from 'lucide-react';
import { supabase } from '../../../client/src/supabaseClient';
import { Brand, LanguageSwitch } from '../components/UI';

export default function AuthPage({ recovery, onRecovered }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');
  const currentMode = recovery ? 'recovery' : mode;
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(false); setMessage('');
    const values = new FormData(event.currentTarget);
    const email = String(values.get('email') || '').trim();
    const password = String(values.get('password') || '');
    try {
      let result;
      if (currentMode === 'recovery') {
        result = await supabase.auth.updateUser({ password });
        if (!result.error) { onRecovered(); return; }
      } else if (currentMode === 'reset') {
        result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?flow=recovery` });
        if (!result.error) setMessage('resetSent');
      } else if (currentMode === 'signup') {
        result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin, data: { full_name: String(values.get('name') || '').trim() } } });
        if (!result.error && !result.data.session) setMessage('confirmEmail');
      } else result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
    } catch { setError(true); } finally { setBusy(false); }
  };
  const switchMode = (next) => { setMode(next); setError(false); setMessage(''); };
  return <main className="app-shell-bg min-h-screen"><header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7 sm:px-10"><Brand /><LanguageSwitch /></header><div className="mx-auto grid max-w-7xl gap-10 px-6 pb-16 pt-8 sm:px-10 lg:grid-cols-[1.15fr_1fr] lg:gap-20 lg:pt-20"><section className="self-center"><div className="research-eyebrow mb-7 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-2"><span className="h-1.5 w-1.5 rounded-full bg-orange-500" />{t('research.beta')}</div><h1 className="max-w-xl text-4xl font-black leading-[1.13] tracking-tight text-slate-950 sm:text-5xl">{t('research.loginTitle')}</h1><p className="mt-6 max-w-lg text-lg leading-8 text-slate-500">{t('research.loginDescription')}</p><div className="mt-9 space-y-4">{['authFeatureOne', 'authFeatureTwo', 'authFeatureThree'].map((key) => <div key={key} className="flex items-center gap-3 text-sm font-medium text-slate-600"><span className="rounded-full bg-white p-1.5 shadow-sm"><Check className="text-emerald-600" size={13} /></span>{t(`research.${key}`)}</div>)}</div></section><section className="app-surface self-start rounded-[32px] p-7 sm:p-10"><h2 className="text-2xl font-bold tracking-tight text-slate-950">{t(`research.${currentMode === 'reset' ? 'forgotPassword' : currentMode === 'recovery' ? 'setPassword' : 'loginFormTitle'}`)}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{t('research.loginHint')}</p><form onSubmit={submit} className="mt-8 space-y-5" data-testid="research-auth-form">{currentMode === 'signup' && <label className="block"><span className="research-label">{t('research.fullName')}</span><input name="name" autoComplete="name" required maxLength={150} className="research-field" /></label>}{currentMode !== 'recovery' && <label className="block"><span className="research-label">{t('research.email')}</span><input name="email" type="email" autoComplete="email" required className="research-field" data-testid="research-email" /></label>}{currentMode !== 'reset' && <label className="block"><span className="research-label">{t('research.password')}</span><input name="password" type="password" autoComplete={currentMode === 'login' ? 'current-password' : 'new-password'} minLength={8} required className="research-field" data-testid="research-password" /></label>}{error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{t('research.authError')}</p>}{message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">{t(`research.${message}`)}</p>}<button disabled={busy} className="research-primary w-full" data-testid="research-sign-in">{busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpRight size={16} />}{t(`research.${currentMode === 'recovery' ? 'setPassword' : currentMode === 'reset' ? 'resetPassword' : currentMode === 'signup' ? 'signUp' : 'signIn'}`)}</button></form>{!recovery && <div className="mt-6 flex flex-col items-center gap-4 text-sm"><button disabled={busy} className="font-semibold text-slate-600 hover:text-slate-950" onClick={() => switchMode(currentMode === 'login' ? 'signup' : 'login')}>{t(`research.${currentMode === 'login' ? 'needAccount' : 'backToLogin'}`)}</button>{currentMode === 'login' && <button disabled={busy} className="text-slate-400 hover:text-slate-700" onClick={() => switchMode('reset')}>{t('research.forgotPassword')}</button>}</div>}</section></div></main>;
}
