import React, { useState } from 'react';
import { Search, Filter, Plus, BarChart3, MoreHorizontal, ArrowUpRight, Hash, LineChart } from 'lucide-react';

const Metrics = ({ metrics = [], onCreate, onEdit, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMetrics = metrics.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTypeIcon = (type) => {
    switch(type) {
      case 'Series': return <LineChart size={16} className="text-blue-600" />;
      case 'Comparison': return <ArrowUpRight size={16} className="text-green-600" />;
      default: return <Hash size={16} className="text-orange-600" />;
    }
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen font-sans text-gray-900">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Global Metrics</h1>
        <button 
            onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm transition-colors"
        >
          <Plus size={18} />
          New Metric
        </button>
      </header>

      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
                type="text" 
                placeholder="Search metrics..." 
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        <button className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium shadow-sm transition-colors">
            <Filter size={16} />
            <span>Filters</span>
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Updated</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Linked Maps</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredMetrics.length === 0 ? (
                <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center">
                            <BarChart3 size={48} className="text-gray-200 mb-4" />
                            <p className="text-lg font-medium text-gray-900">No metrics yet</p>
                            <p className="text-sm text-gray-400 mt-1">Create your first metric to track success.</p>
                        </div>
                    </td>
                </tr>
            ) : (
                filteredMetrics.map((metric) => (
              <tr 
                key={metric.id} 
                className="hover:bg-gray-50/80 transition-colors group cursor-pointer"
                onClick={() => onEdit && onEdit(metric)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-500">
                        <BarChart3 size={16} />
                    </div>
                    <div className="font-bold text-gray-900">{metric.name}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                   <div className="flex items-center gap-2 text-sm text-gray-600">
                     {getTypeIcon(metric.type)}
                     {metric.type}
                   </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {metric.updatedAt}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {metric.linkedMaps} maps
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        <MoreHorizontal size={18} />
                    </button>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Metrics;