import { useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Edit2, Image as ImageIcon, BarChart2 } from 'lucide-react'

export default function MetricCard({ card, onUpdate }) {
  const [isEditing, setIsEditing] = useState(!card.metric)
  const metric = card.metric || { type: 'data', title: 'Metric', value: '0', trend: 'stable', imageUrl: '' }

  const handleSave = (newMetric) => {
    onUpdate({ ...card, metric: newMetric })
  }

  if (isEditing) {
    return (
      <div className="p-3 space-y-3">
        {/* Type Toggle */}
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button 
            onClick={() => handleSave({ ...metric, type: 'data' })}
            className={`flex-1 flex items-center justify-center gap-1 py-1 text-xs font-bold rounded-md transition ${metric.type === 'data' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <BarChart2 size={12} /> Data
          </button>
          <button 
            onClick={() => handleSave({ ...metric, type: 'image' })}
            className={`flex-1 flex items-center justify-center gap-1 py-1 text-xs font-bold rounded-md transition ${metric.type === 'image' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <ImageIcon size={12} /> Image
          </button>
        </div>

        {metric.type === 'data' ? (
          <>
            <div>
              <label className="block text-xs text-gray-500 font-bold mb-1">Metric Name</label>
              <input 
                className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-orange-500"
                value={metric.title}
                onChange={e => handleSave({ ...metric, title: e.target.value })}
                placeholder="e.g. NPS Score"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 font-bold mb-1">Value</label>
                <input 
                  className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-orange-500"
                  value={metric.value}
                  onChange={e => handleSave({ ...metric, value: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 font-bold mb-1">Trend</label>
                <select 
                  className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-orange-500 bg-white"
                  value={metric.trend}
                  onChange={e => handleSave({ ...metric, trend: e.target.value })}
                >
                  <option value="up">Up</option>
                  <option value="down">Down</option>
                  <option value="stable">Stable</option>
                </select>
              </div>
            </div>
          </>
        ) : (
          <div>
            <label className="block text-xs text-gray-500 font-bold mb-1">Image URL</label>
            <input 
              className="w-full text-sm border border-gray-200 rounded px-2 py-1 outline-none focus:border-orange-500"
              value={metric.imageUrl || ''}
              onChange={e => handleSave({ ...metric, imageUrl: e.target.value })}
              placeholder="https://..."
            />
            <div className="mt-2 h-20 bg-gray-50 border border-dashed border-gray-200 rounded flex items-center justify-center text-gray-400 text-xs overflow-hidden">
               {metric.imageUrl ? <img src={metric.imageUrl} className="h-full w-full object-contain" alt="Preview" /> : 'Preview area'}
            </div>
          </div>
        )}

        <button onClick={() => setIsEditing(false)} className="w-full mt-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold py-1 rounded transition">
          Done
        </button>
      </div>
    )
  }

  // View Mode
  if (metric.type === 'image') {
    return (
      <div className="relative group/metric min-h-[80px] flex items-center justify-center bg-gray-50 rounded overflow-hidden">
        {metric.imageUrl ? (
          <img src={metric.imageUrl} alt="Metric Visualization" className="w-full h-auto object-cover" />
        ) : (
          <div className="flex flex-col items-center text-gray-400 p-4">
            <ImageIcon size={24} className="mb-1 opacity-50" />
            <span className="text-xs">No image</span>
          </div>
        )}
        <button 
          onClick={() => setIsEditing(true)} 
          className="absolute top-2 right-2 p-1 bg-white/80 hover:bg-white text-gray-600 rounded shadow-sm opacity-0 group-hover/metric:opacity-100 transition-opacity"
        >
          <Edit2 size={12} />
        </button>
      </div>
    )
  }

  const getTrendIcon = () => {
    switch(metric.trend) {
      case 'up': return <TrendingUp size={16} className="text-green-500" />
      case 'down': return <TrendingDown size={16} className="text-red-500" />
      default: return <Minus size={16} className="text-gray-400" />
    }
  }

  return (
    <div className="p-4 flex flex-col items-center justify-center relative group/metric min-h-[80px]">
      <div className="text-3xl font-bold text-gray-800 mb-1">{metric.value}</div>
      <div className="flex items-center gap-1 text-xs font-medium text-gray-500">
        {metric.title}
        {getTrendIcon()}
      </div>
      <button 
        onClick={() => setIsEditing(true)} 
        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover/metric:opacity-100 transition-opacity"
      >
        <Edit2 size={12} />
      </button>
    </div>
  )
}
