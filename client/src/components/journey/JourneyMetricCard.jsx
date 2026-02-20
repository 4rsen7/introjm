import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, Minus, BarChart3 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, LabelList } from 'recharts';

const JourneyMetricCard = ({ metric }) => {
  const { t } = useTranslation();
  if (!metric) {
    return (
      <div className="flex flex-col items-center justify-center h-24 text-gray-400">
        <BarChart3 size={24} className="mb-2 opacity-50" />
        <span className="text-xs">{t('common.metricNotFound')}</span>
      </div>
    );
  }

  const { name, type, value, suffix, previousValue, reverseColors, seriesData, chartType } = metric;

  const renderContent = () => {
    switch (type) {
      case 'Number':
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-3xl font-bold text-gray-900 tracking-tight">
              {value}<span className="text-lg text-gray-500 ml-0.5 font-medium">{suffix}</span>
            </div>
            <div className="text-xs font-medium text-gray-500 mt-1 text-center truncate w-full px-2">
              {name}
            </div>
          </div>
        );

      case 'Comparison':
        const current = parseFloat(value) || 0;
        const previous = parseFloat(previousValue) || 0;
        const delta = current - previous;
        const isPositive = delta > 0;
        const isNegative = delta < 0;
        // Determine "good" direction
        const isGood = reverseColors ? isNegative : isPositive;
        const colorClass = delta === 0 ? 'text-gray-500' : (isGood ? 'text-green-600' : 'text-red-600');
        const Icon = isPositive ? ArrowUp : (isNegative ? ArrowDown : Minus);

        return (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-2xl font-bold text-gray-900">
              {value}<span className="text-sm text-gray-500 ml-0.5">{suffix}</span>
            </div>
            <div className={`flex items-center gap-1 text-xs font-bold ${colorClass} mt-1`}>
              <Icon size={12} strokeWidth={3} />
              <span>{Math.abs(delta).toFixed(1)}</span>
            </div>
            <div className="text-[10px] font-medium text-gray-400 mt-1 truncate w-full text-center">
              {name}
            </div>
          </div>
        );

      case 'Series':
        return (
          <div className="w-full h-full flex flex-col">
            <div className="text-xs font-bold text-gray-500 mb-1 px-1 truncate">
              {name}
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'line' ? (
                  <LineChart data={seriesData} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#3b82f6" 
                      strokeWidth={2} 
                      dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                      isAnimationActive={true}
                    >
                      <LabelList dataKey="value" position="top" offset={5} fontSize={10} fill="#6b7280" />
                    </Line>
                  </LineChart>
                ) : (
                  <BarChart data={seriesData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Bar 
                      dataKey="value" 
                      fill="#3b82f6" 
                      radius={[2, 2, 0, 0]}
                      isAnimationActive={true}
                    >
                      <LabelList dataKey="value" position="insideTop" offset={5} fontSize={10} fill="#ffffff" style={{ fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return <div className="w-full h-28 p-2">{renderContent()}</div>;
};

export default JourneyMetricCard;