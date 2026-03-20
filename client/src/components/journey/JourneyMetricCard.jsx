import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, Minus, BarChart3 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, LabelList, XAxis, Tooltip, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { CHART_PALETTE, DEFAULT_BAR_COLOR, formatSeriesLabel } from '../../utils/metrics';

const EXPORT_CHART_SIZES = {
  pie: { width: 220, height: 150 },
  donut: { width: 220, height: 150 },
  line: { width: 250, height: 120 },
  area: { width: 250, height: 120 },
  bar: { width: 250, height: 120 },
};

const JourneyMetricCard = React.memo(function JourneyMetricCard({ metric, isExport = false, animate = true }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const [animationSeed, setAnimationSeed] = useState(0);
  const metricId = metric?.id ?? null;
  const metricName = metric?.name ?? '';
  const animationDelay = useMemo(() => {
    const source = String(metricId || metricName);
    const hash = [...source].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return 80 + (hash % 180);
  }, [metricId, metricName]);

  useEffect(() => {
    if (!metric) {
      return undefined;
    }

    if (!animate || isExport) {
      return;
    }

    let frameId;
    let timeoutId;
    frameId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => setAnimationSeed((seed) => seed + 1), animationDelay);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [animate, animationDelay, isExport, metric]);

  if (!metric) {
    return (
      <div className="flex flex-col items-center justify-center h-24 text-gray-400">
        <BarChart3 size={24} className="mb-2 opacity-50" />
        <span className="text-xs">{t('common.metricNotFound')}</span>
      </div>
    );
  }

  const { name, type, value, suffix, previousValue, reverseColors, seriesData, chartType, seriesLabelFormat = 'text' } = metric;

  const shouldAnimate = animate && !isExport;

  const getColor = (i) => (seriesData && seriesData[i]?.color) ? seriesData[i].color : CHART_PALETTE[i % CHART_PALETTE.length];
  const getBarColor = (i) => (seriesData && seriesData[i]?.color) ? seriesData[i].color : DEFAULT_BAR_COLOR;
  const MAX_LABEL_LEN = 7;
  const formatLabel = (label) => {
    const text = formatSeriesLabel(label, seriesLabelFormat, locale);
    if (!text || text.length <= MAX_LABEL_LEN) return text ?? '';
    return text.slice(0, MAX_LABEL_LEN) + '..';
  };

  const renderChart = (chartTypeKey, render) => {
    if (isExport) {
      const size = EXPORT_CHART_SIZES[chartTypeKey] || EXPORT_CHART_SIZES.line;
      return render(size.width, size.height);
    }

    return (
      <ResponsiveContainer width="100%" height="100%" debounce={50}>
        {render()}
      </ResponsiveContainer>
    );
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
                  {renderChart(chartType, (width, height) => (
                    <PieChart key={`pie-${animationSeed}`} width={width} height={height}>
                      <Pie
                        data={seriesData}
                        dataKey="value"
                        nameKey="label"
                        cx="45%"
                        cy="50%"
                        innerRadius={chartType === 'donut' ? '55%' : 0}
                        outerRadius="90%"
                        paddingAngle={1}
                        isAnimationActive={shouldAnimate}
                        animationDuration={950}
                        animationBegin={0}
                      >
                        {hasData &&
                          seriesData.map((_, i) => (
                            <Cell key={i} fill={getColor(i)} />
                          ))}
                      </Pie>
                      {!isExport && <Tooltip formatter={(value, name) => [value, name]} contentStyle={{ fontSize: 11 }} />}
                    </PieChart>
                  ))}
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
              {renderChart(chartType, (width, height) =>
                chartType === 'line' ? (
                  <LineChart key={`line-${animationSeed}`} width={width} height={height} data={seriesData} margin={{ top: 20, right: 20, left: 20, bottom: 4 }}>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={formatLabel} padding={{ left: 8, right: 8 }} interval={0} />
                    {!isExport && <Tooltip formatter={(v, name) => [v, formatLabel(name)]} contentStyle={{ fontSize: 11 }} />}
                    <Line type="monotone" dataKey="value" stroke={getColor(0)} strokeWidth={2} dot={{ r: 3, fill: getColor(0), strokeWidth: 0 }} isAnimationActive={shouldAnimate} animationDuration={900} animationBegin={0}>
                      <LabelList dataKey="value" position="top" offset={5} fontSize={10} fill="#6b7280" />
                    </Line>
                  </LineChart>
                ) : chartType === 'area' ? (
                  <AreaChart key={`area-${animationSeed}`} width={width} height={height} data={seriesData} margin={{ top: 20, right: 20, left: 20, bottom: 4 }}>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={formatLabel} padding={{ left: 8, right: 8 }} interval={0} />
                    {!isExport && <Tooltip formatter={(v, name) => [v, formatLabel(name)]} contentStyle={{ fontSize: 11 }} />}
                    <Area type="monotone" dataKey="value" fill={getColor(0)} stroke={getColor(0)} strokeWidth={2} fillOpacity={0.6} isAnimationActive={shouldAnimate} animationDuration={900} animationBegin={0}>
                      <LabelList dataKey="value" position="top" offset={5} fontSize={10} fill="#6b7280" />
                    </Area>
                  </AreaChart>
                ) : (
                  <BarChart key={`bar-${animationSeed}`} width={width} height={height} data={seriesData} margin={{ top: 0, right: 0, left: 0, bottom: 4 }}>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={formatLabel} padding={{ left: 8, right: 8 }} interval={0} />
                    {!isExport && <Tooltip formatter={(v, name) => [v, formatLabel(name)]} contentStyle={{ fontSize: 11 }} />}
                    <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={shouldAnimate} animationDuration={900} animationBegin={0}>
                      {seriesData.map((_, i) => (
                        <Cell key={i} fill={getBarColor(i)} />
                      ))}
                      <LabelList dataKey="value" position="insideTop" offset={5} fontSize={10} fill="#ffffff" style={{ fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                    </Bar>
                  </BarChart>
                )
              )}
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
});

export default JourneyMetricCard;
