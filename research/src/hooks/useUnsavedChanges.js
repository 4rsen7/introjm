import { createContext, createElement, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const UnsavedChangesContext = createContext(null);

export function UnsavedChangesProvider({ children }) {
  const { t } = useTranslation();
  const editors = useRef(new Set());
  const setDirty = useCallback((id, value) => {
    if (value) editors.current.add(id); else editors.current.delete(id);
  }, []);
  const blocker = useBlocker(useCallback(() => editors.current.size > 0, []));

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(t('research.leaveConfirm'))) {
      editors.current.clear();
      blocker.proceed();
    } else blocker.reset();
  }, [blocker, t]);

  useBeforeUnload(useCallback((event) => {
    if (!editors.current.size) return;
    event.preventDefault();
    event.returnValue = '';
  }, []));

  const confirmLeave = useCallback(() => {
    if (!editors.current.size || window.confirm(t('research.leaveConfirm'))) {
      editors.current.clear();
      return true;
    }
    return false;
  }, [t]);

  return createElement(UnsavedChangesContext.Provider, { value: { setDirty, confirmLeave } }, children);
}

export function useUnsavedChanges(dirty) {
  const context = useContext(UnsavedChangesContext);
  const id = useId();
  if (!context) throw new Error('UnsavedChangesProvider is required');
  useLayoutEffect(() => {
    context.setDirty(id, Boolean(dirty));
    return () => context.setDirty(id, false);
  }, [context.setDirty, dirty, id]);
}

export function useConfirmUnsavedChanges() {
  const context = useContext(UnsavedChangesContext);
  if (!context) throw new Error('UnsavedChangesProvider is required');
  return context.confirmLeave;
}
