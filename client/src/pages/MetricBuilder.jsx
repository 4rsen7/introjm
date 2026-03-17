import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BarChart3, Save, ArrowUp, ArrowDown, Minus, Trash2, Plus, TrendingUp, ChevronDown, Upload, PieChart as PieChartIcon, RefreshCw, Link2 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, Tooltip, ResponsiveContainer, LabelList, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { CHART_PALETTE, DEFAULT_BAR_COLOR, formatSeriesLabel } from '../utils/metrics';
import { getAuthToken } from '../services/auth';
import { mapMetricToClient } from '../hooks/useQueries';
import { MS_EXCEL_DISABLED } from '../config/features';
import { API_BASE_URL } from '../config/api';

const API_URL = API_BASE_URL;

const defaultSeriesData = () => [
  { label: 'Jan', value: 400, color: CHART_PALETTE[0] },
  { label: 'Feb', value: 300, color: CHART_PALETTE[1] },
  { label: 'Mar', value: 600, color: CHART_PALETTE[2] },
];

const MetricBuilder = ({ onBack, onSave, initialData, onSyncSuccess, currentUserId }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const [formData, setFormData] = useState(() => {
    const base = {
      name: 'New Metric',
      dataSource: 'manual',
      type: 'Number',
      value: '0',
      previousValue: '0',
      reverseColors: false,
      suffix: '',
      chartType: 'bar',
      seriesLabelFormat: 'text',
      seriesData: defaultSeriesData(),
      integrationConfig: null,
      ...initialData
    };
    if (!Array.isArray(base.seriesData) || base.seriesData.length === 0) {
      base.seriesData = defaultSeriesData();
    } else {
      base.seriesData = base.seriesData.map((row, i) => ({
        label: row?.label ?? 'New',
        value: typeof row?.value === 'number' ? row.value : Number(row?.value) || 0,
        color: row?.color || CHART_PALETTE[i % CHART_PALETTE.length]
      }));
    }
    return base;
  });
  const [validationError, setValidationError] = useState(null);
  const [integrationStatus, setIntegrationStatus] = useState({ google_sheets: false, microsoft_excel: false });
  const [syncLoading, setSyncLoading] = useState(false);
  const [integrationError, setIntegrationError] = useState(null);
  const [sheetSuggestions, setSheetSuggestions] = useState([]);
  const [sheetsLoadLoading, setSheetsLoadLoading] = useState(false);

  const fileInputRef = useRef(null);

  const isIntegration = formData.dataSource === 'google_sheets' || formData.dataSource === 'microsoft_excel';

  useEffect(() => {
    if (!isIntegration) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/integrations/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!cancelled && data.status === 'success') setIntegrationStatus(data.data);
      } catch {
        if (!cancelled) setIntegrationStatus({ google_sheets: false, microsoft_excel: false });
      }
    })();
    return () => { cancelled = true; };
  }, [isIntegration, formData.dataSource]);

  // Update state if initialData changes
  useEffect(() => {
    if (initialData) {
      setFormData(prev => {
        const next = { ...prev, ...initialData };
        if (!Array.isArray(next.seriesData) || next.seriesData.length === 0) {
          next.seriesData = prev.seriesData?.length ? prev.seriesData : defaultSeriesData();
        } else {
          next.seriesData = next.seriesData.map((row, i) => ({
            label: row?.label ?? 'New',
            value: typeof row?.value === 'number' ? row.value : Number(row?.value) || 0,
            color: row?.color || CHART_PALETTE[i % CHART_PALETTE.length]
          }));
        }
        return next;
      });
    }
  }, [initialData]);

  const handleChange = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'dataSource' && value === 'manual') next.integrationConfig = null;
      return next;
    });
    setValidationError(null);
  };

  const seriesData = Array.isArray(formData.seriesData) ? formData.seriesData : defaultSeriesData();

  const handleSeriesChange = (index, field, val) => {
    const current = Array.isArray(formData.seriesData) ? formData.seriesData : [];
    if (!current[index]) return;
    const newData = current.map((row, i) => {
      if (i !== index) return { ...row };
      if (field === 'value') return { ...row, value: val === '' ? 0 : Number(val) };
      if (field === 'color') return { ...row, color: val };
      return { ...row, [field]: val };
    });
    setFormData(prev => ({ ...prev, seriesData: newData }));
    setValidationError(null);
  };

  const addSeriesRow = () => {
    setFormData(prev => {
      const current = Array.isArray(prev.seriesData) ? prev.seriesData : [];
      const len = current.length;
      const color = CHART_PALETTE[len % CHART_PALETTE.length];
      return { ...prev, seriesData: [...current, { label: 'New', value: 0, color }] };
    });
  };

  const removeSeriesRow = (index) => {
    const current = Array.isArray(formData.seriesData) ? formData.seriesData : [];
    const newData = current.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, seriesData: newData.length ? newData : defaultSeriesData() }));
  };

  const validate = () => {
    setValidationError(null);
    const { type, value, previousValue } = formData;
    if (type === 'Number') {
      const n = parseFloat(value);
      if (value === '' || value == null || Number.isNaN(n)) {
        setValidationError(t('metrics.invalidNumberValue'));
        return false;
      }
    } else if (type === 'Comparison') {
      const n = parseFloat(value);
      const p = parseFloat(previousValue);
      if (value === '' || value == null || Number.isNaN(n)) {
        setValidationError(t('metrics.invalidNumberValue'));
        return false;
      }
      if (previousValue === '' || previousValue == null || Number.isNaN(p)) {
        setValidationError(t('metrics.invalidPreviousValue'));
        return false;
      }
    } else if (type === 'Series') {
      if (seriesData.length === 0) {
        setValidationError(t('metrics.seriesDataEmpty'));
        return false;
      }
      for (let i = 0; i < seriesData.length; i++) {
        const v = Number(seriesData[i]?.value);
        if (Number.isNaN(v)) {
          setValidationError(t('metrics.invalidSeriesData'));
          return false;
        }
      }
    }
    return true;
  };

  const handleSaveClick = () => {
    if (!validate()) return;
    const payload = { ...formData, seriesData };
    if (isIntegration && formData.integrationConfig) payload.integrationConfig = formData.integrationConfig;
    onSave(payload);
  };

  const handleConnectIntegration = async () => {
    setIntegrationError(null);
    const provider = formData.dataSource;
    try {
      const token = await getAuthToken();
      if (!token) { setIntegrationError(t('metrics.integrationLoginRequired')); return; }
      const res = await fetch(`${API_URL}/integrations/${provider}/authorize`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.redirectUrl) window.location.href = data.redirectUrl;
      else setIntegrationError(data.error || data.message || 'Failed to get authorization URL');
    } catch (e) {
      setIntegrationError(e.message || 'Connection failed');
    }
  };

  const handleIntegrationConfigChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      integrationConfig: { ...(prev.integrationConfig || {}), [field]: value }
    }));
    setIntegrationError(null);
  };

  const handleSync = async () => {
    setSyncLoading(true);
    setIntegrationError(null);
    try {
      const token = await getAuthToken();
      if (!token) { setIntegrationError(t('metrics.integrationLoginRequired')); setSyncLoading(false); return; }
      if (formData.id) {
        const res = await fetch(`${API_URL}/metrics/${formData.id}/sync`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.status === 'success' && data.data) {
          const mapped = mapMetricToClient(data.data);
          setFormData(prev => ({ ...prev, ...mapped, value: mapped.value, previousValue: mapped.previousValue, seriesData: mapped.seriesData || prev.seriesData }));
          onSyncSuccess?.();
          setSyncLoading(false);
          return;
        }
        setIntegrationError(data.error || data.message || t('metrics.syncFailed'));
        setSyncLoading(false);
        return;
      }
      const cfg = formData.integrationConfig;
      const hasConfig = formData.dataSource === 'google_sheets'
        ? (cfg?.spreadsheetId && cfg?.range)
        : (cfg?.fileId && cfg?.range);
      if (!hasConfig) {
        setIntegrationError(t('metrics.integrationEnterSpreadsheetAndRange'));
        setSyncLoading(false);
        return;
      }
      const res = await fetch(`${API_URL}/integrations/fetch-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          provider: formData.dataSource,
          integration_config: formData.integrationConfig,
          type: formData.type
        })
      });
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        const mapped = mapMetricToClient(data.data);
        setFormData(prev => ({ ...prev, value: mapped.value, previousValue: mapped.previousValue, seriesData: mapped.seriesData || prev.seriesData }));
        return;
      }
      setIntegrationError(data.error || data.message || t('metrics.syncFailed'));
    } catch (e) {
      setIntegrationError(e.message || t('metrics.syncFailed'));
    } finally {
      setSyncLoading(false);
    }
  };

  const handleLoadSheets = async () => {
    const sid = formData.integrationConfig?.spreadsheetId?.trim();
    if (!sid) { setIntegrationError(t('metrics.integrationEnterSpreadsheetAndRange')); return; }
    setSheetsLoadLoading(true);
    setIntegrationError(null);
    setSheetSuggestions([]);
    try {
      const token = await getAuthToken();
      if (!token) { setIntegrationError(t('metrics.integrationLoginRequired')); setSheetsLoadLoading(false); return; }
      const res = await fetch(`${API_URL}/integrations/google_sheets/spreadsheet-info?spreadsheetId=${encodeURIComponent(sid)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data?.sheets)) {
        setSheetSuggestions(data.data.sheets);
        return;
      }
      setIntegrationError(data.error || data.message || t('metrics.sheetsLoadError'));
    } catch (e) {
      setIntegrationError(e.message || t('metrics.sheetsLoadError'));
    } finally {
      setSheetsLoadLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      const newSeriesData = [];

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const delimiter = trimmed.includes(';') ? ';' : ',';
        const parts = trimmed.split(delimiter);
        const label = parts[0];
        const valueRaw = parts[1];
        if (!label || valueRaw === undefined) return;
        const normalized = String(valueRaw).trim().replace(',', '.');
        const num = parseFloat(normalized);
        if (!isNaN(num)) {
          const color = CHART_PALETTE[newSeriesData.length % CHART_PALETTE.length];
          newSeriesData.push({ label: label.trim(), value: num, color });
        }
      });

      if (newSeriesData.length > 0) {
        setFormData(prev => ({ ...prev, seriesData: newSeriesData }));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex h-full bg-white">
      {/* Left Panel - Settings (40%) */}
      <div className="w-2/5 border-r border-gray-200 flex flex-col h-full bg-white">
        <div className="h-16 border-b border-gray-200 flex items-center px-6 gap-4 shrink-0">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition">
                <ArrowLeft size={20} />
            </button>
            <h2 className="text-lg font-bold text-gray-900">{t('common.metricSettings')}</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* General Settings */}
            <section className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400">{t('metrics.general')}</h3>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.metricName')}</label>
                    <input 
                        type="text" 
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                        placeholder={t('metrics.metricNamePlaceholder')}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('metrics.dataSource')}</label>
                    <div className="relative">
                        <select 
                            value={formData.dataSource}
                            onChange={(e) => handleChange('dataSource', e.target.value)}
                            className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none"
                        >
                            <option value="manual">{t('metrics.manualEntry')}</option>
                            <option value="google_sheets">{t('metrics.googleSheets')}</option>
                            <option value="microsoft_excel" disabled={MS_EXCEL_DISABLED}>{t('metrics.microsoftExcel')}{MS_EXCEL_DISABLED ? ` (${t('common.soon')})` : ''}</option>
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                </div>

                {isIntegration && (
                    <section className="space-y-4 pt-4 border-t border-gray-100">
                        <h3 className="text-xs font-bold text-gray-400">{t('metrics.integrationSetup')}</h3>
                        {integrationError && <p className="text-sm text-red-600">{integrationError}</p>}
                        {formData.integrationConnectedBy && formData.integrationConnectedBy.id !== currentUserId && (
                            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" role="status">
                                {t('metrics.integrationConnectedToOther', { name: formData.integrationConnectedBy.full_name || t('metrics.anotherUser') })}
                            </p>
                        )}
                        <div>
                            {formData.dataSource === 'google_sheets' && (
                                <>
                                    <p className="text-xs text-gray-500 mb-2">{integrationStatus.google_sheets ? t('metrics.connectedGoogle') : t('metrics.connectGoogleFirst')}</p>
                                    {!integrationStatus.google_sheets && (
                                        <button type="button" onClick={handleConnectIntegration} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition">
                                            <Link2 size={16} /> {t('metrics.connectAccount')}
                                        </button>
                                    )}
                                    <div className="mt-3 space-y-2">
                                        <label className="block text-sm font-medium text-gray-700">{t('metrics.spreadsheetId')}</label>
                                        <input type="text" value={formData.integrationConfig?.spreadsheetId || ''} onChange={(e) => handleIntegrationConfigChange('spreadsheetId', e.target.value)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                                        {integrationStatus.google_sheets && formData.integrationConfig?.spreadsheetId?.trim() && (
                                            <button type="button" onClick={handleLoadSheets} disabled={sheetsLoadLoading} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-50">
                                                <RefreshCw size={16} className={sheetsLoadLoading ? 'animate-spin' : ''} /> {sheetsLoadLoading ? t('metrics.loadingSheets') : t('metrics.loadSheets')}
                                            </button>
                                        )}
                                        <label className="block text-sm font-medium text-gray-700">{t('metrics.range')}</label>
                                        <input type="text" value={formData.integrationConfig?.range || ''} onChange={(e) => handleIntegrationConfigChange('range', e.target.value)} placeholder="Sheet1!A1:B10" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                                        {sheetSuggestions.length > 0 && (
                                            <div className="mt-2">
                                                <p className="text-xs font-medium text-gray-500 mb-1">{t('metrics.suggestedRanges')}</p>
                                                <ul className="space-y-1">
                                                    {sheetSuggestions.map((s, i) => (
                                                        <li key={i} className="flex items-center justify-between gap-2 text-sm">
                                                            <span className="text-gray-700 truncate">{s.title} ({s.rowCount} × {s.columnCount})</span>
                                                            <button type="button" onClick={() => handleIntegrationConfigChange('range', s.suggestedRange)} className="shrink-0 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">
                                                                {t('metrics.useThisRange')}
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                            {formData.dataSource === 'microsoft_excel' && (
                                <>
                                    <p className="text-xs text-gray-500 mb-2">{integrationStatus.microsoft_excel ? t('metrics.connectedExcel') : t('metrics.connectExcelFirst')}</p>
                                    {!integrationStatus.microsoft_excel && (
                                        <button type="button" onClick={handleConnectIntegration} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition">
                                            <Link2 size={16} /> {t('metrics.connectAccount')}
                                        </button>
                                    )}
                                    <div className="mt-3 space-y-2">
                                        <label className="block text-sm font-medium text-gray-700">{t('metrics.fileId')}</label>
                                        <input type="text" value={formData.integrationConfig?.fileId || ''} onChange={(e) => handleIntegrationConfigChange('fileId', e.target.value)} placeholder={t('metrics.fileIdPlaceholder')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                                        <label className="block text-sm font-medium text-gray-700">{t('metrics.sheetName')}</label>
                                        <input type="text" value={formData.integrationConfig?.sheetName || 'Sheet1'} onChange={(e) => handleIntegrationConfigChange('sheetName', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                                        <label className="block text-sm font-medium text-gray-700">{t('metrics.range')}</label>
                                        <input type="text" value={formData.integrationConfig?.range || ''} onChange={(e) => handleIntegrationConfigChange('range', e.target.value)} placeholder="A1:B10" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                                    </div>
                                </>
                            )}
                        </div>
                        {isIntegration && (integrationStatus[formData.dataSource] || formData.integrationConfig) && (
                            <button type="button" onClick={handleSync} disabled={syncLoading} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-50">
                                <RefreshCw size={16} className={syncLoading ? 'animate-spin' : ''} /> {syncLoading ? t('metrics.syncing') : t('metrics.refreshData')}
                            </button>
                        )}
                    </section>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('metrics.type')}</label>
                    <div className="relative">
                        <select 
                            value={formData.type}
                            onChange={(e) => handleChange('type', e.target.value)}
                            className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none"
                        >
                            <option value="Number">{t('metrics.typeNumber')}</option>
                            <option value="Comparison">{t('metrics.typeComparison')}</option>
                            <option value="Series">{t('metrics.typeSeries')}</option>
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                </div>
            </section>

            {/* Contextual Settings */}
            {(formData.type === 'Number' || formData.type === 'Comparison') && (
                <section className="space-y-4 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2">
                    <h3 className="text-xs font-bold text-gray-400">{t('metrics.valueConfiguration')}</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('metrics.currentValue')}</label>
                            <input 
                                type="text" 
                                value={formData.value}
                                onChange={(e) => handleChange('value', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t('metrics.suffix')}</label>
                            <input 
                                type="text" 
                                value={formData.suffix}
                                onChange={(e) => handleChange('suffix', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder={t('metrics.suffixPlaceholder')}
                            />
                        </div>
                        {formData.type === 'Comparison' && (
                            <div className="col-span-2 space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('metrics.previousValue')}</label>
                                    <input 
                                        type="text" 
                                        value={formData.previousValue}
                                        onChange={(e) => handleChange('previousValue', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="checkbox" 
                                        id="reverseColors"
                                        checked={formData.reverseColors}
                                        onChange={(e) => handleChange('reverseColors', e.target.checked)}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                                    />
                                    <label htmlFor="reverseColors" className="text-sm text-gray-700 select-none">{t('metrics.reverseColors')}</label>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {formData.type === 'Series' && (
                <section className="space-y-4 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2">
                    <h3 className="text-xs font-bold text-gray-400">{t('metrics.chartConfiguration')}</h3>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('metrics.chartType')}</label>
                        <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg">
                            {['bar', 'line', 'area', 'pie', 'donut'].map((ct) => (
                                <button
                                    key={ct}
                                    onClick={() => handleChange('chartType', ct)}
                                    className={`flex-1 min-w-0 py-1.5 text-xs font-medium rounded-md transition flex items-center justify-center gap-1 ${formData.chartType === ct ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {ct === 'bar' && <BarChart3 size={14} />}
                                    {ct === 'line' && <TrendingUp size={14} />}
                                    {ct === 'area' && <BarChart3 size={14} />}
                                    {(ct === 'pie' || ct === 'donut') && <PieChartIcon size={14} />}
                                    {t(`metrics.${ct === 'bar' ? 'barChart' : ct === 'line' ? 'lineChart' : ct === 'area' ? 'areaChart' : ct === 'pie' ? 'pieChart' : 'donutChart'}`)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t('metrics.labelFormat')}</label>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => handleChange('seriesLabelFormat', 'text')}
                                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${formData.seriesLabelFormat === 'text' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {t('metrics.labelFormatText')}
                            </button>
                            <button
                                onClick={() => handleChange('seriesLabelFormat', 'date')}
                                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${formData.seriesLabelFormat === 'date' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {t('metrics.labelFormatDate')}
                            </button>
                        </div>
                        <p className="mt-1.5 text-xs text-gray-500">{t('metrics.labelFormatHint')}</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('metrics.dataSeries')}</label>
                        <div className="space-y-2">
                            {seriesData.map((row, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <input
                                        type="color"
                                        className="w-8 h-8 rounded border border-gray-300 cursor-pointer p-0"
                                        value={row.color || CHART_PALETTE[i % CHART_PALETTE.length]}
                                        onChange={(e) => handleSeriesChange(i, 'color', e.target.value)}
                                        title={t('metrics.color')}
                                    />
                                    <input 
                                        className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-blue-500" 
                                        value={row.label} 
                                        onChange={(e) => handleSeriesChange(i, 'label', e.target.value)} 
                                        placeholder={t('metrics.labelPlaceholder')}
                                    />
                                    <input 
                                        type="number"
                                        className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-blue-500" 
                                        value={row.value} 
                                        onChange={(e) => handleSeriesChange(i, 'value', e.target.value)} 
                                        placeholder={t('metrics.valuePlaceholder')}
                                    />
                                    <button onClick={() => removeSeriesRow(i)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                            <div className="flex gap-4 mt-2">
                                <button onClick={addSeriesRow} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                                    <Plus size={14} /> {t('metrics.addRow')}
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1">
                                    <Upload size={14} /> {t('metrics.importCsv')}
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept=".csv" 
                                    onChange={handleFileUpload} 
                                />
                            </div>
                        </div>
                    </div>
                </section>
            )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
            {validationError && (
                <p className="text-sm text-red-600 mb-3" role="alert">{validationError}</p>
            )}
            <button 
                onClick={handleSaveClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
            >
                <Save size={18} />
                {t('metrics.saveMetric')}
            </button>
        </div>
      </div>

      {/* Right Panel - Preview (60%) — sticky so it stays at top when left column scrolls */}
      <div className="w-3/5 bg-gray-100 flex flex-col relative overflow-hidden sticky top-0 self-start min-h-screen">
         <div className="absolute top-6 right-20 bg-white/80 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-gray-500 border border-gray-200 shadow-sm z-10">
            {t('metrics.livePreview')}
         </div>

         <div className="flex-1 flex items-start justify-center pt-32 pb-12">
            {/* Preview Card */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 w-full max-w-md flex flex-col items-center text-center transition-all duration-300 transform hover:scale-105">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-4">
                    <BarChart3 size={24} />
                </div>
                
                <h3 className="text-gray-500 font-medium text-sm mb-2">{formData.name || t('common.metricName')}</h3>
                
                {formData.type === 'Number' ? (
                    <div className="text-6xl font-bold text-gray-900 tracking-tight my-4">
                        {formData.value || '0'}<span className="text-4xl text-gray-400 ml-1 font-medium">{formData.suffix}</span>
                    </div>
                ) : formData.type === 'Comparison' ? (
                    <div className="flex flex-col items-center">
                        <div className="text-6xl font-bold text-gray-900 tracking-tight my-2">
                            {formData.value || '0'}<span className="text-4xl text-gray-400 ml-1 font-medium">{formData.suffix}</span>
                        </div>
                        {(() => {
                            const current = parseFloat(formData.value) || 0;
                            const previous = parseFloat(formData.previousValue) || 0;
                            const delta = current - previous;
                            const percent = previous !== 0 ? ((delta / previous) * 100).toFixed(1) : 0;
                            const isPositive = delta > 0;
                            const isNegative = delta < 0;
                            
                            // Determine if the change is "good" based on reverseColors setting
                            const isGood = formData.reverseColors ? isNegative : isPositive;
                            const colorClass = delta === 0 
                                ? 'bg-gray-100 text-gray-600' 
                                : (isGood ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700');

                            return (
                                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold ${colorClass}`}>
                                    {isPositive && <ArrowUp size={16} />}
                                    {isNegative && <ArrowDown size={16} />}
                                    {!isPositive && !isNegative && <Minus size={16} />}
                                    <span>{Math.abs(percent)}% vs last period</span>
                                </div>
                            );
                        })()}
                    </div>
                ) : formData.type === 'Series' ? (
                    <div className="w-full h-64 mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            {formData.chartType === 'line' ? (
                                <LineChart data={seriesData} margin={{ top: 20, right: 20, left: 20, bottom: 28 }}>
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} tickFormatter={(l) => formatSeriesLabel(l, formData.seriesLabelFormat, locale)} padding={{ left: 10, right: 10 }} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ stroke: '#e5e7eb' }} labelFormatter={(l) => formatSeriesLabel(l, formData.seriesLabelFormat, locale)} />
                                    <Line type="monotone" dataKey="value" stroke={seriesData[0]?.color || CHART_PALETTE[0]} strokeWidth={3} dot={{ r: 4, fill: seriesData[0]?.color || CHART_PALETTE[0], strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }}>
                                        <LabelList dataKey="value" position="top" offset={10} fontSize={12} fill="#6b7280" />
                                    </Line>
                                </LineChart>
                            ) : formData.chartType === 'area' ? (
                                <AreaChart data={seriesData} margin={{ top: 20, right: 20, left: 20, bottom: 28 }}>
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} tickFormatter={(l) => formatSeriesLabel(l, formData.seriesLabelFormat, locale)} padding={{ left: 10, right: 10 }} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ stroke: '#e5e7eb' }} labelFormatter={(l) => formatSeriesLabel(l, formData.seriesLabelFormat, locale)} />
                                    <Area type="monotone" dataKey="value" fill={seriesData[0]?.color || CHART_PALETTE[0]} stroke={seriesData[0]?.color || CHART_PALETTE[0]} strokeWidth={2} fillOpacity={0.6}>
                                        <LabelList dataKey="value" position="top" offset={10} fontSize={12} fill="#6b7280" />
                                    </Area>
                                </AreaChart>
                            ) : (formData.chartType === 'pie' || formData.chartType === 'donut') ? (
                                <PieChart>
                                    <Pie
                                        data={seriesData}
                                        dataKey="value"
                                        nameKey="label"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={formData.chartType === 'donut' ? '60%' : 0}
                                        outerRadius="80%"
                                        paddingAngle={1}
                                        label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`}
                                    >
                                        {seriesData.map((_, i) => (
                                            <Cell key={i} fill={seriesData[i]?.color || CHART_PALETTE[i % CHART_PALETTE.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} formatter={(value, name) => [value, name]} />
                                </PieChart>
                            ) : (
                                <BarChart data={seriesData} margin={{ top: 20, right: 0, left: 0, bottom: 28 }}>
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} dy={10} tickFormatter={(l) => formatSeriesLabel(l, formData.seriesLabelFormat, locale)} padding={{ left: 10, right: 10 }} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f3f4f6' }} labelFormatter={(l) => formatSeriesLabel(l, formData.seriesLabelFormat, locale)} />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {seriesData.map((entry, i) => (
                                            <Cell key={i} fill={entry.color || DEFAULT_BAR_COLOR} />
                                        ))}
                                        <LabelList dataKey="value" position="insideTop" offset={10} fontSize={12} fill="#ffffff" style={{ fontWeight: 'bold' }} />
                                    </Bar>
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="h-32 flex flex-col items-center justify-center text-gray-400 italic bg-gray-50 w-full rounded-lg border-2 border-dashed border-gray-200 my-4">
                        <BarChart3 size={32} className="mb-2 opacity-20" />
                        <span>{t('metrics.previewNotAvailable', { type: formData.type === 'Number' ? t('metrics.typeNumber') : formData.type === 'Comparison' ? t('metrics.typeComparison') : t('metrics.typeSeries') })}</span>
                    </div>
                )}

                <div className="mt-6 pt-6 border-t border-gray-100 w-full flex justify-between text-xs text-gray-400">
                    <span>{formData.dataSource === 'manual' ? t('metrics.sourceManual') : formData.dataSource === 'google_sheets' ? t('metrics.sourceGoogleSheets') : formData.dataSource === 'microsoft_excel' ? t('metrics.sourceMicrosoftExcel') : t('metrics.sourceApi')}</span>
                    <span>{t('metrics.updatedJustNow')}</span>
                </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default MetricBuilder;
