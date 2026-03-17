import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, X, Send, AlertCircle, Lightbulb, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { API_BASE_URL } from '../../config/api';

const API_URL = API_BASE_URL;

export default function SupportFeedback() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [list, setList] = useState([]);
  const [view, setView] = useState('menu'); // 'menu' | 'issue' | 'idea' | 'thread'
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Forms
  const [issueForm, setIssueForm] = useState({ subject: '', body: '', steps_to_reproduce: '', attachment_url: '' });
  const [ideaForm, setIdeaForm] = useState({ subject: '', body: '', category: '' });

  const fetchUnread = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/feedback/unread-count`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.status === 'success') setUnreadCount(json.data ?? 0);
    } catch (e) { console.error(e); }
  }, []);

  const fetchList = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/feedback`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.status === 'success') setList(json.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open) {
      fetchUnread();
      fetchList();
    }
  }, [open, fetchUnread, fetchList]);

  useEffect(() => {
    const t = setInterval(fetchUnread, 300000);
    return () => clearInterval(t);
  }, [fetchUnread]);

  const submitIssue = async (e) => {
    e.preventDefault();
    const token = await getAuthToken();
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: 'issue',
          subject: issueForm.subject.trim(),
          body: issueForm.body.trim(),
          steps_to_reproduce: issueForm.steps_to_reproduce.trim() || undefined,
          attachment_url: issueForm.attachment_url.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setIssueForm({ subject: '', body: '', steps_to_reproduce: '', attachment_url: '' });
        setView('menu');
        fetchList();
        fetchUnread();
      } else {
        alert(json.message || json.error || t('support.failedToSend'));
      }
    } catch (e) {
      console.error(e);
      alert(t('support.failedToSend'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitIdea = async (e) => {
    e.preventDefault();
    const token = await getAuthToken();
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: 'idea',
          subject: ideaForm.subject.trim(),
          body: ideaForm.body.trim(),
          category: ideaForm.category.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setIdeaForm({ subject: '', body: '', category: '' });
        setView('menu');
        fetchList();
      } else {
        alert(json.message || json.error || t('support.failedToSend'));
      }
    } catch (e) {
      console.error(e);
      alert(t('support.failedToSend'));
    } finally {
      setSubmitting(false);
    }
  };

  const openThread = async (id) => {
    const token = await getAuthToken();
    if (!token) return;
    setLoading(true);
    try {
      const [threadRes, readRes] = await Promise.all([
        fetch(`${API_URL}/feedback/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/feedback/${id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const json = await threadRes.json();
      if (json.status === 'success' && readRes.ok) {
        const ticketUnread = list.find((f) => f.id === id)?.unread_count ?? 0;
        setUnreadCount((prev) => Math.max(0, prev - ticketUnread));
        setList((prev) => prev.map((f) => (f.id === id ? { ...f, unread_count: 0 } : f)));
        setThread(json.data);
        setView('thread');
        await Promise.all([fetchUnread(), fetchList()]);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const deleteTicket = async (id, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(t('support.deleteTicketConfirm'))) return;
    const token = await getAuthToken();
    if (!token) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API_URL}/feedback/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.status === 'success') {
        setList((prev) => prev.filter((f) => f.id !== id));
        setView('menu');
        setThread(null);
        fetchUnread();
      } else {
        alert(json.message || json.error || t('support.failedToDelete'));
      }
    } catch (e) {
      console.error(e);
      alert(t('support.failedToDelete'));
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (d) => (d ? new Date(d).toLocaleString() : '');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 px-2 py-1.5 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-all text-xs font-medium"
      >
        <MessageCircle size={14} />
        <span>{t('support.button')}</span>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 cursor-pointer" onClick={() => { setOpen(false); setView('menu'); setThread(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900">
                {view === 'menu' && t('support.howCanWeHelp')}
                {view === 'issue' && t('support.reportIssue')}
                {view === 'idea' && t('support.sendIdea')}
                {view === 'thread' && (thread?.subject || t('support.conversation'))}
              </h2>
              <button type="button" onClick={() => { if (view === 'menu') setOpen(false); else { setView('menu'); setThread(null); } }} className="p-2 hover:bg-gray-200 rounded-lg">
                {view !== 'menu' ? <ChevronRight className="rotate-180" size={20} /> : <X size={22} />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {view === 'menu' && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setView('issue')}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition text-left"
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <AlertCircle className="text-blue-600" size={24} />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{t('support.reportIssue')}</div>
                      <div className="text-sm text-gray-500">{t('support.somethingBroken')}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('idea')}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition text-left"
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <Lightbulb className="text-blue-600" size={24} />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{t('support.sendIdea')}</div>
                      <div className="text-sm text-gray-500">{t('support.whatWeCanImprove')}</div>
                    </div>
                  </button>
                  <div className="pt-4 border-t border-gray-200">
                    <div className="text-sm font-semibold text-gray-700 mb-2">{t('support.mySubmissions')}</div>
                    {loading ? (
                      <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
                    ) : list.length === 0 ? (
                      <p className="text-sm text-gray-500">{t('support.noSubmissionsYet')}</p>
                    ) : (
                      <ul className="space-y-2">
                        {list.map((f) => (
                          <li key={f.id} className="flex items-center gap-1 group">
                            <button
                              type="button"
                              onClick={() => openThread(f.id)}
                              className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-100 text-left min-w-0"
                            >
                              <span className="text-sm font-medium truncate flex-1">{f.subject}</span>
                              {f.unread_count > 0 && (
                                <span className="ml-2 flex-shrink-0 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center">
                                  {f.unread_count}
                                </span>
                              )}
                              <ChevronRight size={16} className="text-gray-400 flex-shrink-0 ml-1" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => deleteTicket(f.id, e)}
                              disabled={deletingId === f.id}
                              className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-50"
                              title={t('common.deleteTicket')}
                            >
                              {deletingId === f.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {view === 'issue' && (
                <form onSubmit={submitIssue} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.subject')}</label>
                    <input required value={issueForm.subject} onChange={e => setIssueForm(prev => ({ ...prev, subject: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.briefDescription')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.description')}</label>
                    <textarea required rows={4} value={issueForm.body} onChange={e => setIssueForm(prev => ({ ...prev, body: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.whatWentWrong')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.stepsToReproduce')}</label>
                    <textarea rows={3} value={issueForm.steps_to_reproduce} onChange={e => setIssueForm(prev => ({ ...prev, steps_to_reproduce: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.stepsPlaceholder')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.screenshotLink')}</label>
                    <input value={issueForm.attachment_url} onChange={e => setIssueForm(prev => ({ ...prev, attachment_url: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.screenshotPlaceholder')} />
                  </div>
                  <button type="submit" disabled={submitting} className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                    {t('support.send')}
                  </button>
                </form>
              )}

              {view === 'idea' && (
                <form onSubmit={submitIdea} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.subject')}</label>
                    <input required value={ideaForm.subject} onChange={e => setIdeaForm(prev => ({ ...prev, subject: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.shortTitle')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.yourIdea')}</label>
                    <textarea required rows={4} value={ideaForm.body} onChange={e => setIdeaForm(prev => ({ ...prev, body: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.describeSuggestion')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.categoryOptional')}</label>
                    <input value={ideaForm.category} onChange={e => setIdeaForm(prev => ({ ...prev, category: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.categoryPlaceholder')} />
                  </div>
                  <button type="submit" disabled={submitting} className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                    {t('support.send')}
                  </button>
                </form>
              )}

              {view === 'thread' && thread && (
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 rounded-lg text-sm">
                    <div className="font-medium text-gray-900">{thread.subject}</div>
                    <div className="text-gray-600 mt-1">{thread.body}</div>
                    {thread.steps_to_reproduce && <div className="mt-2 text-gray-500"><span className="font-medium">{t('support.stepsLabel')}</span> {thread.steps_to_reproduce}</div>}
                    {thread.attachment_url && <div className="mt-1"><a href={thread.attachment_url} target="_blank" rel="noopener noreferrer" className="text-blue-600">{t('support.attachment')}</a></div>}
                    <div className="text-xs text-gray-400 mt-2">{formatDate(thread.created_at)}</div>
                  </div>
                  {thread.replies?.map((r) => (
                    <div key={r.id} className={`p-3 rounded-lg text-sm ${r.author_type === 'admin' ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
                      <div className="font-medium text-gray-700">{r.author_type === 'admin' ? t('support.supportAuthor') : t('support.you')}</div>
                      <div className="text-gray-700 mt-1">{r.body}</div>
                      <div className="text-xs text-gray-400 mt-2">{formatDate(r.created_at)}</div>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => deleteTicket(thread.id)}
                      disabled={deletingId === thread.id}
                      className="flex items-center justify-center gap-2 w-full py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg border border-red-200 hover:border-red-300 transition-colors disabled:opacity-50"
                    >
                      {deletingId === thread.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      {t('common.deleteTicket')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
