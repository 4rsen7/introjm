import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const UnsavedChangesContext = createContext(null);

export function UnsavedChangesProvider({ children }) {
  const { t } = useTranslation();
  const [dirty, setDirty] = useState(false);
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(t('research.leaveConfirm'))) {
      setDirty(false);
      blocker.proceed();
    } else blocker.reset();
  }, [blocker, t]);

  useBeforeUnload(useCallback((event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  }, [dirty]));

  const confirmLeave = useCallback(() => {
    if (!dirty || window.confirm(t('research.leaveConfirm'))) {
      setDirty(false);
      return true;
    }
    return false;
  }, [dirty, t]);

  return createElement(UnsavedChangesContext.Provider, { value: { setDirty, confirmLeave } }, children);
}

export function useUnsavedChanges(dirty) {
  const context = useContext(UnsavedChangesContext);
  if (!context) throw new Error('UnsavedChangesProvider is required');
  useEffect(() => {
    context.setDirty(Boolean(dirty));
    return () => context.setDirty(false);
  }, [context.setDirty, dirty]);
}

export function useConfirmUnsavedChanges() {
  const context = useContext(UnsavedChangesContext);
  if (!context) throw new Error('UnsavedChangesProvider is required');
  return context.confirmLeave;
}
