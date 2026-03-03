import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, Minus, BarChart3 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, LabelList, XAxis, Tooltip, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { CHART_PALETTE, DEFAULT_BAR_COLOR, formatSeriesLabel } from '../../utils/metrics';

const JourneyMetricCard = ({ metric }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  if (!metric) {
    return (
      <div className="flex flex-col items-center justify-center h-24 text-gray-400">
        <BarChart3 size={24} className="mb-2 opacity-50" />
        <span className="text-xs">{t('common.metricNotFound')}</span>
      </div>
    );
  }

  const { name, type, value, suffix, previousValue, reverseColors, seriesData, chartType, seriesLabelFormat = 'text' } = metric;
  const getColor = (i) => (seriesData && seriesData[i]?.color) ? seriesData[i].color : CHART_PALETTE[i % CHART_PALETTE.length];
  const getBarColor = (i) => (seriesData && seriesData[i]?.color) ? seriesData[i].color : DEFAULT_BAR_COLOR;
  const MAX_LABEL_LEN = 7;
  const formatLabel = (label) => {
    const text = formatSeriesLabel(label, seriesLabelFormat, locale);
    if (!text || text.length <= MAX_LABEL_LEN) return text ?? '';
    return text.slice(0, MAX_LABEL_LEN) + '..';
  };

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

      case 'Comparison': {
        const current = parseFloat(value) || 0;
        const previous = parseFloat(previousValue) || 0;
        const delta = current - previous;
        const percent = previous !== 0 ? ((delta / previous) * 100).toFixed(1) : 0;

        const isPositive = delta > 0;
        const isNegative = delta < 0;
        const isGood = reverseColors ? isNegative : isPositive;
        const Icon = isPositive ? ArrowUp : isNegative ? ArrowDown : Minus;

        const badgeClass =
          delta === 0
            ? 'bg-gray-100 text-gray-600'
            : isGood
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700';

        return (
          <div className="w-full h-full flex flex-col px-2">
            <div className="text-xs font-bold text-gray-500 mb-2 truncate w-full text-left px-1">
              {name}
            </div>
            <div className="w-full text-center">
              <div className="text-4xl font-extrabold text-gray-900 tracking-tight">
                {value || '0'}
                <span className="text-2xl text-gray-400 ml-1 font-medium">
                  {suffix}
                </span>
              </div>
            </div>
            <div className="w-full flex justify-center mt-3">
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${badgeClass}`}
              >
                <Icon size={14} />
                <span>{Math.abs(percent)}% vs last period</span>
              </div>
            </div>
          </div>
        );
      }

      case 'Series':
        if (chartType === 'pie' || chartType === 'donut') {
          const hasData = Array.isArray(seriesData) && seriesData.length > 0;
          return (
            <div className="w-full h-full flex flex-col">
              <div className="text-xs font-bold text-gray-500 mb-1 px-1 truncate">
                {name}
              </div>
              <div className="flex-1 min-h-0 flex items-center gap-2 px-1">
                <div className="min-w-0 h-full" style={{ flex: '0 0 70%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={seriesData}
                        dataKey="value"
                        nameKey="label"
                        cx="45%"
                        cy="50%"
                        innerRadius={chartType === 'donut' ? '55%' : 0}
                        outerRadius="90%"
                        paddingAngle={1}
                        isAnimationActive={true}
                      >
                        {hasData &&
                          seriesData.map((_, i) => (
                            <Cell key={i} fill={getColor(i)} />
                          ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [value, name]} contentStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {hasData && (
                  <div className="flex flex-col gap-1 pr-1" style={{ flex: '0 0 30%' }}>
                    {seriesData.map((row, i) => (
                      <div key={row.label ?? i} className="flex items-center gap-1 text-[10px] text-gray-600 min-w-0">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: getColor(i) }}
                        />
                        <span className="truncate">
                          {formatLabel(row.label)}: {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        }

        return (
          <div className="w-full h-full flex flex-col">
            <div className="text-xs font-bold text-gray-500 mb-1 px-1 truncate">
              {name}
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'line' ? (
                  <LineChart data={seriesData} margin={{ top: 20, right: 20, left: 20, bottom: 4 }}>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={formatLabel} padding={{ left: 8, right: 8 }} interval={0} />
                    <Tooltip formatter={(v, name) => [v, formatLabel(name)]} contentStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="value" stroke={getColor(0)} strokeWidth={2} dot={{ r: 3, fill: getColor(0), strokeWidth: 0 }} isAnimationActive={true}>
                      <LabelList dataKey="value" position="top" offset={5} fontSize={10} fill="#6b7280" />
                    </Line>
                  </LineChart>
                ) : chartType === 'area' ? (
                  <AreaChart data={seriesData} margin={{ top: 20, right: 20, left: 20, bottom: 4 }}>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={formatLabel} padding={{ left: 8, right: 8 }} interval={0} />
                    <Tooltip formatter={(v, name) => [v, formatLabel(name)]} contentStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="value" fill={getColor(0)} stroke={getColor(0)} strokeWidth={2} fillOpacity={0.6} isAnimationActive={true}>
                      <LabelList dataKey="value" position="top" offset={5} fontSize={10} fill="#6b7280" />
                    </Area>
                  </AreaChart>
                ) : (
                  <BarChart data={seriesData} margin={{ top: 0, right: 0, left: 0, bottom: 4 }}>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={formatLabel} padding={{ left: 8, right: 8 }} interval={0} />
                    <Tooltip formatter={(v, name) => [v, formatLabel(name)]} contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={true}>
                      {seriesData.map((_, i) => (
                        <Cell key={i} fill={getBarColor(i)} />
                      ))}
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

  const cardHeight = type === 'Series'
    ? (chartType === 'bar' ? 'h-36' : chartType === 'pie' || chartType === 'donut' ? 'h-44' : 'h-40')
    : (type === 'Comparison' ? 'h-32' : 'h-28');
  return <div className={`w-full ${cardHeight} px-2 pt-2 pb-1`}>{renderContent()}</div>;
};

export default JourneyMetricCard;