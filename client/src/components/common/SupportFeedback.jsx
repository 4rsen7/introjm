import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageCircle,
  X,
  Send,
  AlertCircle,
  Lightbulb,
  ChevronRight,
  Loader2,
  Trash2,
  BellRing,
  Pin,
} from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { API_BASE_URL } from '../../config/api';

const API_URL = API_BASE_URL;

const NEWS_TONE_STYLES = {
  cobalt: {
    shell: 'border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50',
    badge: 'bg-blue-600 text-white',
    mutedBadge: 'bg-blue-100 text-blue-700',
  },
  emerald: {
    shell: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50',
    badge: 'bg-emerald-600 text-white',
    mutedBadge: 'bg-emerald-100 text-emerald-700',
  },
  amber: {
    shell: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50',
    badge: 'bg-amber-500 text-white',
    mutedBadge: 'bg-amber-100 text-amber-700',
  },
  rose: {
    shell: 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-pink-50',
    badge: 'bg-rose-500 text-white',
    mutedBadge: 'bg-rose-100 text-rose-700',
  },
};

function getNewsToneStyles(tone) {
  return NEWS_TONE_STYLES[tone] || NEWS_TONE_STYLES.cobalt;
}

export default function SupportFeedback() {
  const { t, i18n } = useTranslation();
  const contentLocale = i18n.language?.startsWith('en') ? 'en' : 'uk';
  const [open, setOpen] = useState(false);
  const [feedbackUnreadCount, setFeedbackUnreadCount] = useState(0);
  const [newsUnreadCount, setNewsUnreadCount] = useState(0);
  const [list, setList] = useState([]);
  const [newsList, setNewsList] = useState([]);
  const [view, setView] = useState('menu'); // 'menu' | 'news' | 'news-detail' | 'issue' | 'idea' | 'thread'
  const [thread, setThread] = useState(null);
  const [newsItem, setNewsItem] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [newsLoading, setNewsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [openingNewsId, setOpeningNewsId] = useState(null);

  const [issueForm, setIssueForm] = useState({ subject: '', body: '', steps_to_reproduce: '', attachment_url: '' });
  const [ideaForm, setIdeaForm] = useState({ subject: '', body: '', category: '' });

  const unreadCount = feedbackUnreadCount + newsUnreadCount;

  const headerTitle = useMemo(() => {
    if (view === 'issue') return t('support.reportIssue');
    if (view === 'idea') return t('support.sendIdea');
    if (view === 'thread') return thread?.subject || t('support.conversation');
    if (view === 'news') return t('support.newsCenter');
    if (view === 'news-detail') return newsItem?.title || t('support.newsCenter');
    return t('support.howCanWeHelp');
  }, [newsItem?.title, t, thread?.subject, view]);

  const closeModal = useCallback(() => {
    setOpen(false);
    setView('menu');
    setThread(null);
    setNewsItem(null);
  }, []);

  const goBack = useCallback(() => {
    if (view === 'thread') {
      setView('menu');
      setThread(null);
      return;
    }
    if (view === 'news-detail') {
      setView('news');
      setNewsItem(null);
      return;
    }
    setView('menu');
    setNewsItem(null);
  }, [view]);

  const fetchUnread = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;

    try {
      const [feedbackRes, newsRes] = await Promise.all([
        fetch(`${API_URL}/feedback/unread-count`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/news/unread-count?locale=${contentLocale}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const [feedbackJson, newsJson] = await Promise.all([
        feedbackRes.json().catch(() => null),
        newsRes.json().catch(() => null),
      ]);

      if (feedbackJson?.status === 'success') {
        setFeedbackUnreadCount(feedbackJson.data ?? 0);
      }
      if (newsJson?.status === 'success') {
        setNewsUnreadCount(newsJson.data ?? 0);
      }
    } catch (error) {
      console.error(error);
    }
  }, [contentLocale]);

  const fetchFeedbackList = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;

    setFeedbackLoading(true);
    try {
      const res = await fetch(`${API_URL}/feedback`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.status === 'success') setList(json.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setFeedbackLoading(false);
    }
  }, []);

  const fetchNewsList = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;

    setNewsLoading(true);
    try {
      const res = await fetch(`${API_URL}/news?locale=${contentLocale}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.status === 'success') setNewsList(json.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setNewsLoading(false);
    }
  }, [contentLocale]);

  useEffect(() => {
    if (open) {
      fetchUnread();
      fetchFeedbackList();
      fetchNewsList();
    }
  }, [open, fetchFeedbackList, fetchNewsList, fetchUnread]);

  useEffect(() => {
    fetchUnread();
    const timer = setInterval(fetchUnread, 300000);
    return () => clearInterval(timer);
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
        fetchFeedbackList();
        fetchUnread();
      } else {
        alert(json.message || json.error || t('support.failedToSend'));
      }
    } catch (error) {
      console.error(error);
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
        fetchFeedbackList();
      } else {
        alert(json.message || json.error || t('support.failedToSend'));
      }
    } catch (error) {
      console.error(error);
      alert(t('support.failedToSend'));
    } finally {
      setSubmitting(false);
    }
  };

  const openThread = async (id) => {
    const token = await getAuthToken();
    if (!token) return;

    try {
      const [threadRes, readRes] = await Promise.all([
        fetch(`${API_URL}/feedback/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/feedback/${id}/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const json = await threadRes.json();
      if (json.status === 'success' && readRes.ok) {
        const ticketUnread = list.find((item) => item.id === id)?.unread_count ?? 0;
        setFeedbackUnreadCount((prev) => Math.max(0, prev - ticketUnread));
        setList((prev) => prev.map((item) => (item.id === id ? { ...item, unread_count: 0 } : item)));
        setThread(json.data);
        setView('thread');
        fetchUnread();
      }
    } catch (error) {
      console.error(error);
    } finally {
      // No-op: keep state transitions above explicit while preserving a stable try/catch/finally shape.
    }
  };

  const openNewsItem = async (id) => {
    const token = await getAuthToken();
    if (!token) return;

    const currentItem = newsList.find((item) => item.id === id);
    const shouldMarkRead = currentItem && !currentItem.is_read;

    setOpeningNewsId(id);
    try {
      const requests = [
        fetch(`${API_URL}/news/${id}?locale=${contentLocale}`, { headers: { Authorization: `Bearer ${token}` } }),
      ];
      if (shouldMarkRead) {
        requests.push(fetch(`${API_URL}/news/${id}/read?locale=${contentLocale}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }));
      }

      const [detailRes, readRes] = await Promise.all(requests);
      const json = await detailRes.json();

      if (json.status === 'success') {
        const nextItem = {
          ...json.data,
          is_read: shouldMarkRead ? readRes?.ok : json.data.is_read,
        };

        setNewsItem(nextItem);
        setView('news-detail');

        if (shouldMarkRead && readRes?.ok) {
          setNewsUnreadCount((prev) => Math.max(0, prev - 1));
          setNewsList((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setOpeningNewsId(null);
    }
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
        setList((prev) => prev.filter((item) => item.id !== id));
        setView('menu');
        setThread(null);
        fetchUnread();
      } else {
        alert(json.message || json.error || t('support.failedToDelete'));
      }
    } catch (error) {
      console.error(error);
      alert(t('support.failedToDelete'));
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (value) => (value ? new Date(value).toLocaleString() : '');
  const formatNewsDate = (value) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

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
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full shadow-[0_6px_14px_rgba(239,68,68,0.28)] ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 cursor-pointer"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900">{headerTitle}</h2>
              <button type="button" onClick={() => (view === 'menu' ? closeModal() : goBack())} className="p-2 hover:bg-gray-200 rounded-lg">
                {view !== 'menu' ? <ChevronRight className="rotate-180" size={20} /> : <X size={22} />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {view === 'menu' && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setView('news')}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50 hover:border-blue-300 hover:shadow-sm transition text-left"
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm">
                      <BellRing size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-gray-900">{t('support.newsButton')}</div>
                        {newsUnreadCount > 0 ? (
                          <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold">
                            {newsUnreadCount > 99 ? '99+' : newsUnreadCount}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-sm text-gray-500">{t('support.newsDescription')}</div>
                    </div>
                    <ChevronRight size={18} className="text-blue-400 flex-shrink-0" />
                  </button>

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
                    {feedbackLoading ? (
                      <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
                    ) : list.length === 0 ? (
                      <p className="text-sm text-gray-500">{t('support.noSubmissionsYet')}</p>
                    ) : (
                      <ul className="space-y-2">
                        {list.map((item) => (
                          <li key={item.id} className="flex items-center gap-1 group">
                            <button
                              type="button"
                              onClick={() => openThread(item.id)}
                              className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-100 text-left min-w-0"
                            >
                              <span className="text-sm font-medium truncate flex-1">{item.subject}</span>
                              {item.unread_count > 0 && (
                                <span className="ml-2 flex-shrink-0 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center">
                                  {item.unread_count}
                                </span>
                              )}
                              <ChevronRight size={16} className="text-gray-400 flex-shrink-0 ml-1" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => deleteTicket(item.id, e)}
                              disabled={deletingId === item.id}
                              className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-50"
                              title={t('common.deleteTicket')}
                            >
                              {deletingId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {view === 'news' && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900">{t('support.newsCenter')}</div>
                    <div className="text-sm text-gray-500 mt-1">{t('support.newsCenterDescription')}</div>
                  </div>

                  {newsLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
                  ) : newsList.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 px-5 py-10 text-center">
                      <div className="text-sm font-medium text-gray-700">{t('support.noNewsYet')}</div>
                      <div className="text-sm text-gray-500 mt-1">{t('support.noNewsYetDescription')}</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {newsList.map((item) => {
                        const tone = getNewsToneStyles(item.tone);
                        const isOpening = openingNewsId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openNewsItem(item.id)}
                            className={`w-full text-left rounded-2xl border p-4 transition hover:shadow-sm ${tone.shell}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ${item.is_read ? tone.mutedBadge : tone.badge}`}>
                                {isOpening ? <Loader2 size={18} className="animate-spin" /> : <BellRing size={18} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-semibold text-gray-900">{item.title}</div>
                                  {item.pinned ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium text-gray-700 border border-gray-200">
                                      <Pin size={11} />
                                      {t('support.pinned')}
                                    </span>
                                  ) : null}
                                  {!item.is_read ? (
                                    <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                                      {t('support.newLabel')}
                                    </span>
                                  ) : null}
                                </div>
                                {item.subtitle ? <div className="mt-1 text-sm text-gray-600">{item.subtitle}</div> : null}
                                <div className="mt-2 text-sm text-gray-600 line-clamp-3">{item.summary}</div>
                                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                                  <span>{formatNewsDate(item.published_at || item.created_at)}</span>
                                  <span className="inline-flex items-center gap-1 font-medium text-gray-700">
                                    {t('support.readUpdate')}
                                    <ChevronRight size={14} />
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {view === 'news-detail' && newsItem && (
                <div className="space-y-4">
                  <div className={`rounded-3xl border p-5 ${getNewsToneStyles(newsItem.tone).shell}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      {newsItem.pinned ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${getNewsToneStyles(newsItem.tone).badge}`}>
                          <Pin size={12} />
                          {t('support.pinned')}
                        </span>
                      ) : null}
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">{formatNewsDate(newsItem.published_at || newsItem.created_at)}</span>
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold text-gray-900">{newsItem.title}</h3>
                    {newsItem.subtitle ? <p className="mt-2 text-base text-gray-600">{newsItem.subtitle}</p> : null}
                    {newsItem.cover_image_url ? (
                      <img
                        src={newsItem.cover_image_url}
                        alt={newsItem.title}
                        className="mt-5 h-48 w-full rounded-2xl object-cover border border-white/70 shadow-sm"
                      />
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="text-sm leading-6 text-gray-600">{newsItem.summary}</p>
                    <div
                      className="app-article app-article-sm mt-4 max-w-none"
                      dangerouslySetInnerHTML={{ __html: newsItem.body_html }}
                    />
                  </div>
                </div>
              )}

              {view === 'issue' && (
                <form onSubmit={submitIssue} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.subject')}</label>
                    <input required value={issueForm.subject} onChange={(e) => setIssueForm((prev) => ({ ...prev, subject: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.briefDescription')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.description')}</label>
                    <textarea required rows={4} value={issueForm.body} onChange={(e) => setIssueForm((prev) => ({ ...prev, body: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.whatWentWrong')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.stepsToReproduce')}</label>
                    <textarea rows={3} value={issueForm.steps_to_reproduce} onChange={(e) => setIssueForm((prev) => ({ ...prev, steps_to_reproduce: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.stepsPlaceholder')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.screenshotLink')}</label>
                    <input value={issueForm.attachment_url} onChange={(e) => setIssueForm((prev) => ({ ...prev, attachment_url: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.screenshotPlaceholder')} />
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
                    <input required value={ideaForm.subject} onChange={(e) => setIdeaForm((prev) => ({ ...prev, subject: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.shortTitle')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.yourIdea')}</label>
                    <textarea required rows={4} value={ideaForm.body} onChange={(e) => setIdeaForm((prev) => ({ ...prev, body: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.describeSuggestion')} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('support.categoryOptional')}</label>
                    <input value={ideaForm.category} onChange={(e) => setIdeaForm((prev) => ({ ...prev, category: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder={t('support.categoryPlaceholder')} />
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
                  {thread.replies?.map((reply) => (
                    <div key={reply.id} className={`p-3 rounded-lg text-sm ${reply.author_type === 'admin' ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
                      <div className="font-medium text-gray-700">{reply.author_type === 'admin' ? t('support.supportAuthor') : t('support.you')}</div>
                      <div className="text-gray-700 mt-1">{reply.body}</div>
                      <div className="text-xs text-gray-400 mt-2">{formatDate(reply.created_at)}</div>
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
