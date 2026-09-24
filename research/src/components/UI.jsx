import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ArrowRight, FlaskConical, Loader2, X } from 'lucide-react';

export function Brand() {
  return <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/10"><FlaskConical size={21} /></span><div><div className="text-lg font-black tracking-tight text-slate-950">Research<span className="ml-1 text-orange-600">.</span></div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">IteroJM</div></div></div>;
}
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  return <select aria-label={t('research.language')} className="rounded-lg border border-slate-200 bg-white/70 px-2 py-2 text-xs font-bold text-slate-600" value={i18n.language} onChange={(event) => i18n.changeLanguage(event.target.value)}><option value="uk">UA</option><option value="en">EN</option></select>;
}
export function Loading() {
  const { t } = useTranslation();
  return <div role="status" className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500"><Loader2 className="animate-spin" size={20} />{t('research.loading')}</div>;
}
export function ErrorState({ error, onRetry }) {
  const { t } = useTranslation();
  const disabled = error?.code === 'RESEARCH_DISABLED';
  const access = error?.code === 'RESEARCH_ACCESS_REQUIRED';
  const noSources = error?.code === 'RESEARCH_NO_SOURCES';
  const limit = error?.code === 'RESEARCH_LIMIT_REACHED';
  const conflict = error?.status === 409 && !noSources;
  return <div role="alert" className="app-surface rounded-3xl p-6 sm:p-8" data-testid="research-error"><AlertCircle className="mb-4 text-amber-600" size={24} /><h2 className="text-xl font-bold tracking-tight text-slate-900">{t(`research.${noSources ? 'noSourcesTitle' : limit ? 'limitTitle' : disabled ? 'unavailableTitle' : access ? 'accessTitle' : conflict ? 'conflictTitle' : 'errorTitle'}`)}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t(`research.${noSources ? 'noSourcesBody' : limit ? 'limitBody' : disabled ? 'unavailableBody' : access ? 'accessBody' : conflict ? 'conflictBody' : error?.status === 404 ? 'notFound' : 'errorBody'}`)}</p>{onRetry && <button type="button" className="research-secondary mt-5" onClick={onRetry}>{t(`research.${conflict ? 'reloadLatest' : 'retry'}`)}</button>}</div>;
}
export function EmptyState({ icon: Icon = FlaskConical, title, description, action, onAction }) {
  return <div className="app-empty-state rounded-3xl px-6 py-12 text-center"><span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white bg-white/80 text-orange-600 shadow-sm"><Icon size={25} /></span><h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">{description}</p>{action && <button type="button" className="research-primary mt-6" onClick={onAction}>{action}<ArrowRight size={16} /></button>}</div>;
}
export function Modal({ title, children, onClose, busy }) {
  const { t } = useTranslation();
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const element = document.querySelector('[data-research-dialog]');
    const selectors = 'button:not(:disabled), input, textarea, select, a[href]';
    element?.querySelector('input, textarea, button')?.focus();
    const handler = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key === 'Tab') {
        const items = Array.from(element?.querySelectorAll(selectors) || []);
        const first = items[0]; const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', handler); previous?.focus?.(); };
  }, [onClose, busy]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="research-modal-title" data-research-dialog className="app-modal-panel max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6 sm:p-8"><div className="mb-6 flex items-center justify-between gap-4"><h2 id="research-modal-title" className="text-2xl font-bold tracking-tight">{title}</h2><button aria-label={t('research.close')} disabled={busy} onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button></div>{children}</section></div>;
}
export function Status({ status }) {
  const { t } = useTranslation();
  const key = ['draft', 'completed', 'processing', 'failed', 'recording', 'ready', 'archived'].includes(status) ? status : 'unknownStatus';
  const color = ['completed', 'ready'].includes(status) ? 'bg-emerald-50 text-emerald-700' : status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500';
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${color}`}>{t(`research.${key}`)}</span>;
}
