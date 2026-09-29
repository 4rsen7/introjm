import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { AlertCircle, ArrowRight, ChevronDown, FlaskConical, Loader2, X } from 'lucide-react';
import HeaderSelect from './HeaderSelect';

export function Brand() {
  return <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/10"><FlaskConical size={21} /></span><div><div className="text-lg font-black tracking-tight text-slate-950">Research<span className="ml-1 text-orange-600">.</span></div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">IteroJM</div></div></div>;
}
export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  return <HeaderSelect label={t('research.language')} value={i18n.language} options={[{ value: 'uk', label: 'Українська', shortLabel: 'UA' }, { value: 'en', label: 'English', shortLabel: 'EN' }]} onChange={language => i18n.changeLanguage(language)} testId="research-language" compact />;
}
export function Loading() {
  const { t } = useTranslation();
  return <div role="status" className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500"><Loader2 className="animate-spin" size={20} />{t('research.loading')}</div>;
}
export function ErrorState({ error, onRetry }) {
  const { t } = useTranslation();
  const specific = t(`research.error_${error?.code}`, { defaultValue: '' });
  const disabled = error?.code === 'RESEARCH_DISABLED';
  const access = error?.code === 'RESEARCH_ACCESS_REQUIRED';
  const noSources = error?.code === 'RESEARCH_NO_SOURCES';
  const limit = error?.code === 'RESEARCH_LIMIT_REACHED';
  const conflict = error?.status === 409 && !noSources;
  return <div role="alert" className="app-surface rounded-3xl p-6 sm:p-8" data-testid="research-error"><AlertCircle className="mb-4 text-amber-600" size={24} /><h2 className="research-section-heading">{t(`research.${noSources ? 'noSourcesTitle' : limit ? 'limitTitle' : disabled ? 'unavailableTitle' : access ? 'accessTitle' : conflict ? 'conflictTitle' : 'errorTitle'}`)}</h2><p className="research-description mt-2 max-w-2xl">{specific || t(`research.${noSources ? 'noSourcesBody' : limit ? 'limitBody' : disabled ? 'unavailableBody' : access ? 'accessBody' : conflict ? 'conflictBody' : error?.status === 404 ? 'notFound' : 'errorBody'}`)}</p>{onRetry && <button type="button" className="research-secondary mt-5" onClick={onRetry}>{t(`research.${conflict ? 'reloadLatest' : 'retry'}`)}</button>}</div>;
}
export function EmptyState({ icon: Icon = FlaskConical, title, description, action, onAction }) {
  return <div className="app-empty-state rounded-3xl px-6 py-12 text-center"><span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white bg-white/80 text-orange-600 shadow-sm"><Icon size={25} /></span><h2 className="research-section-heading">{title}</h2><p className="research-description mx-auto mt-3 max-w-lg">{description}</p>{action && <button type="button" className="research-primary mt-6" onClick={onAction}>{action}<ArrowRight size={16} /></button>}</div>;
}
export function DisclosureButton({ open, onClick, icon: Icon, children, controls }) {
  return <button type="button" className="research-disclosure" aria-expanded={open} aria-controls={controls} onClick={onClick}><span className="flex min-w-0 items-center gap-3">{Icon && <Icon size={19} className="shrink-0 text-orange-600" />}<span>{children}</span></span><ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} /></button>;
}

export function ModalForm({ as: Element = 'form', onSubmit, children, actions, className = '', testId }) {
  return <Element onSubmit={onSubmit} className={`research-modal-form ${className}`} data-testid={testId}>
    <div className="research-modal-fields space-y-5">{children}</div>
    <div className="research-form-actions research-modal-actions">{actions}</div>
  </Element>;
}

export function Modal({ title, children, onClose, busy, guardChanges = false }) {
  const { t } = useTranslation();
  const dialogRef = useRef(null);
  const edited = useRef(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(guardChanges && dirty && !busy);
  const requestClose = () => {
    if (busy) return;
    if (!guardChanges || !edited.current || window.confirm(t('research.discardForm'))) onClose();
  };
  const latest = useRef({ onClose, busy });
  latest.current = { onClose: requestClose, busy };
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const element = dialogRef.current;
    const selectors = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]';
    element?.querySelector('input, textarea, button')?.focus();
    const handler = (event) => {
      if (event.key === 'Escape' && !latest.current.busy) latest.current.onClose();
      if (event.key === 'Tab') {
        const items = Array.from(element?.querySelectorAll(selectors) || []).filter(item => item.getClientRects().length);
        const first = items[0]; const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', handler); previous?.focus?.(); };
  }, []);
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-3 backdrop-blur-sm sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} data-research-dialog onChangeCapture={() => { edited.current = true; setDirty(true); }} onClickCapture={event => { if (event.target.closest('[data-modal-dismiss]')) { event.preventDefault(); event.stopPropagation(); requestClose(); } }} className="app-modal-panel flex max-h-[92dvh] min-w-0 w-full max-w-2xl flex-col overflow-hidden rounded-3xl"><div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/70 px-5 py-5 sm:px-8 sm:py-6"><h2 id={titleId} className="research-section-heading min-w-0 break-words pt-1">{title}</h2><button type="button" aria-label={t('research.close')} disabled={busy} onClick={requestClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={20} /></button></div><div className="research-modal-body min-h-0 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-7">{children}</div></section></div>, document.body);
}
export function Status({ status }) {
  const { t } = useTranslation();
  const key = ['draft', 'completed', 'processing', 'failed', 'recording', 'ready', 'archived'].includes(status) ? status : 'unknownStatus';
  const color = ['completed', 'ready'].includes(status) ? 'bg-emerald-50 text-emerald-700' : status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500';
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${color}`}>{t(`research.${key}`)}</span>;
}
