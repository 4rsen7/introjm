import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, BarChart3, Save, ArrowUp, ArrowDown, Minus, Trash2, Plus, TrendingUp, ChevronDown, Upload } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import MetricCard from '../components/metrics/MetricCard';

const MetricBuilder = ({ onBack, onSave, initialData }) => {
  const [formData, setFormData] = useState({
    name: 'New Metric',
    dataSource: 'manual',
    type: 'Number',
    value: '0',
    previousValue: '0',
    reverseColors: false,
    suffix: '',
    chartType: 'bar',
    seriesData: [
        { label: 'Jan', value: 400 },
        { label: 'Feb', value: 300 },
        { label: 'Mar', value: 600 },
    ],
    ...initialData
  });

  const fileInputRef = useRef(null);

  // Update state if initialData changes
  useEffect(() => {
    if (initialData) {
        setFormData(prev => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSeriesChange = (index, field, val) => {
    const newData = [...formData.seriesData];
    newData[index][field] = field === 'value' ? Number(val) : val;
    setFormData(prev => ({ ...prev, seriesData: newData }));
  };

  const addSeriesRow = () => {
    setFormData(prev => ({
        ...prev,
        seriesData: [...prev.seriesData, { label: 'New', value: 0 }]
    }));
  };

  const removeSeriesRow = (index) => {
    const newData = [...formData.seriesData];
    newData.splice(index, 1);
    setFormData(prev => ({ ...prev, seriesData: newData }));
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
        const [label, value] = line.split(',');
        if (label && value && !isNaN(parseFloat(value))) {
          newSeriesData.push({ label: label.trim(), value: parseFloat(value) });
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
            <h2 className="text-lg font-bold text-gray-900">Metric Settings</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* General Settings */}
            <section className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">General</h3>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Metric Name</label>
                    <input 
                        type="text" 
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                        placeholder="e.g. NPS Score"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data Source</label>
                    <div className="relative">
                        <select 
                            value={formData.dataSource}
                            onChange={(e) => handleChange('dataSource', e.target.value)}
                            className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none"
                        >
                            <option value="manual">Manual Entry</option>
                            <option value="api" disabled>API Integration (Pro)</option>
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <div className="relative">
                        <select 
                            value={formData.type}
                            onChange={(e) => handleChange('type', e.target.value)}
                            className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none"
                        >
                            <option value="Number">Number</option>
                            <option value="Comparison">Comparison</option>
                            <option value="Series">Series</option>
                        </select>
                        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                </div>
            </section>

            {/* Contextual Settings */}
            {(formData.type === 'Number' || formData.type === 'Comparison') && (
                <section className="space-y-4 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Value Configuration</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Current Value</label>
                            <input 
                                type="text" 
                                value={formData.value}
                                onChange={(e) => handleChange('value', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Suffix</label>
                            <input 
                                type="text" 
                                value={formData.suffix}
                                onChange={(e) => handleChange('suffix', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="%, $"
                            />
                        </div>
                        {formData.type === 'Comparison' && (
                            <div className="col-span-2 space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Previous Value</label>
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
                                    <label htmlFor="reverseColors" className="text-sm text-gray-700 select-none">Reverse Colors (Lower is better)</label>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {formData.type === 'Series' && (
                <section className="space-y-4 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Chart Configuration</h3>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Chart Type</label>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button 
                                onClick={() => handleChange('chartType', 'bar')}
                                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition flex items-center justify-center gap-2 ${formData.chartType === 'bar' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <BarChart3 size={16} /> Bar Chart
                            </button>
                            <button 
                                onClick={() => handleChange('chartType', 'line')}
                                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition flex items-center justify-center gap-2 ${formData.chartType === 'line' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <TrendingUp size={16} /> Line Chart
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Data Series</label>
                        <div className="space-y-2">
                            {formData.seriesData.map((row, i) => (
                                <div key={i} className="flex gap-2">
                                    <input 
                                        className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-blue-500" 
                                        value={row.label} 
                                        onChange={(e) => handleSeriesChange(i, 'label', e.target.value)} 
                                        placeholder="Label"
                                    />
                                    <input 
                                        type="number"
                                        className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-blue-500" 
                                        value={row.value} 
                                        onChange={(e) => handleSeriesChange(i, 'value', e.target.value)} 
                                        placeholder="Value"
                                    />
                                    <button onClick={() => removeSeriesRow(i)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                            <div className="flex gap-4 mt-2">
                                <button onClick={addSeriesRow} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                                    <Plus size={14} /> Add Row
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1">
                                    <Upload size={14} /> Import CSV
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
            <button 
                onClick={() => onSave(formData)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
            >
                <Save size={18} />
                Save Metric
            </button>
        </div>
      </div>

      {/* Right Panel - Preview (60%) */}
      <div className="w-3/5 bg-gray-100 flex flex-col relative overflow-hidden">
         <div className="absolute top-6 right-20 bg-white/80 backdrop-blur px-3 py-1 rounded-full text-xs font-medium text-gray-500 border border-gray-200 shadow-sm z-10">
            Live Preview
         </div>

         <div className="flex-1 flex items-center justify-center p-12">
            {/* Preview Card */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 w-full max-w-md flex flex-col items-center text-center transition-all duration-300 transform hover:scale-105">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-4">
                    <BarChart3 size={24} />
                </div>
                
                <h3 className="text-gray-500 font-medium uppercase tracking-wide text-sm mb-2">{formData.name || 'Metric Name'}</h3>
                
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
                                <LineChart data={formData.seriesData}>
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} dy={10} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ stroke: '#e5e7eb' }} />
                                    <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                                </LineChart>
                            ) : (
                                <BarChart data={formData.seriesData}>
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} dy={10} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f3f4f6' }} />
                                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="h-32 flex flex-col items-center justify-center text-gray-400 italic bg-gray-50 w-full rounded-lg border-2 border-dashed border-gray-200 my-4">
                        <BarChart3 size={32} className="mb-2 opacity-20" />
                        <span>Preview not available for {formData.type}</span>
                    </div>
                )}

                <div className="mt-6 pt-6 border-t border-gray-100 w-full flex justify-between text-xs text-gray-400">
                    <span>Source: {formData.dataSource === 'manual' ? 'Manual Entry' : 'API'}</span>
                    <span>Updated: Just now</span>
                </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default MetricBuilder;