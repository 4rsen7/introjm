import React, { useContext, useEffect, useState, useMemo } from "react";
import { Row, Col, Card, Spin, Alert, Segmented, DatePicker, Space } from "antd";
import type { Dayjs } from "dayjs";
import { UserOutlined, GlobalOutlined, RiseOutlined, CloudServerOutlined, CalendarOutlined, FileTextOutlined } from "@ant-design/icons";
import { Line } from "@ant-design/plots";
import dayjs from "dayjs";
import { supabaseClient } from "../../providers/supabase-client";
import { ColorModeContext } from "../../contexts/color-mode";

const { RangePicker } = DatePicker;

const CHART_METRICS = ["users", "journeys", "transcriptions"] as const;
type ChartMetric = (typeof CHART_METRICS)[number];

const CHART_METRIC_LABELS: Record<ChartMetric, string> = {
  users: "Users",
  journeys: "Journeys",
  transcriptions: "Transcriptions",
};

const CHART_METRIC_COLORS: Record<ChartMetric, string> = {
  users: "#3E7BFA",
  journeys: "#14B8A6",
  transcriptions: "#F59E0B",
};

interface DashboardStats {
  total_users: number;
  total_journeys: number;
  new_users_last_30d: number;
  journeys_created_24h: number;
  activation_rate: number;
  api_errors_24h: number;
  total_transcriptions: number;
  openai_transcriptions: number;
  gemini_transcriptions: number;
  avg_transcription_duration_seconds: number;
  longest_transcription_duration_seconds: number;
  total_transcription_estimated_cost_usd: number;
  transcription_duration_coverage: number;
  transcription_cost_coverage: number;
  total_ai_summaries: number;
  openai_summaries: number;
  gemini_summaries: number;
  res_total_users?: number;
  res_total_journeys?: number;
  res_new_users?: number;
  res_journeys_24h?: number;
  res_activation_rate?: number;
  res_api_errors_24h?: number;
  res_total_transcriptions?: number;
  res_openai_transcriptions?: number;
  res_gemini_transcriptions?: number;
  res_avg_transcription_duration_seconds?: number;
  res_longest_transcription_duration_seconds?: number;
  res_total_transcription_estimated_cost_usd?: number;
  res_transcription_duration_coverage?: number;
  res_transcription_cost_coverage?: number;
  res_total_ai_summaries?: number;
  res_openai_summaries?: number;
  res_gemini_summaries?: number;
}

interface ChartData {
  date: string;
  metric: ChartMetric;
  value: number;
}

function normalizeChartMetric(metric: unknown): ChartMetric {
  return CHART_METRICS.includes(metric as ChartMetric) ? (metric as ChartMetric) : "users";
}

function formatDuration(seconds?: number | null) {
  const safeSeconds = Number(seconds);
  if (!Number.isFinite(safeSeconds) || safeSeconds <= 0) return "—";

  const totalSeconds = Math.round(safeSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function formatCurrency(value?: number | null) {
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue)) return "Not tracked";
  return safeValue.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: safeValue >= 100 ? 0 : 2,
    maximumFractionDigits: safeValue >= 100 ? 0 : 2,
  });
}

// Заповнюємо всі дні в діапазоні [start, end], значення з data або 0 для всіх серій
function fillMissingDatesInRange(
  data: any[],
  start: Date,
  end: Date
): ChartData[] {
  const filled: ChartData[] = [];
  const lookup = new Map<string, number>();

  data.forEach((item) => {
    const date = String(item.date ?? item.res_date ?? "");
    if (!date) return;
    const metric = normalizeChartMetric(item.metric ?? item.res_metric);
    lookup.set(`${date}:${metric}`, Number(item.value ?? item.res_value ?? 0));
  });

  let cursor = dayjs(start).startOf("day");
  const lastDay = dayjs(end).startOf("day");

  while (cursor.isBefore(lastDay) || cursor.isSame(lastDay, "day")) {
    const dateStr = cursor.format("YYYY-MM-DD");
    CHART_METRICS.forEach((metric) => {
      filled.push({
        date: dateStr,
        metric,
        value: lookup.get(`${dateStr}:${metric}`) ?? 0,
      });
    });
    cursor = cursor.add(1, "day");
  }

  return filled;
}

// Stat Card: темний у dark theme, світлий з бордером у light theme
const StatCard = ({ title, value, icon, trend, trendColor = "#4ADE80", suffix, isDark }: any) => {
  if (isDark) {
    return (
      <div style={{
        backgroundColor: "#16181D",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "12px",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ textTransform: "uppercase", fontSize: "11px", fontWeight: 600, color: "rgba(255, 255, 255, 0.45)", letterSpacing: "0.5px" }}>{title}</span>
          {icon && <span style={{ color: "rgba(255, 255, 255, 0.25)", fontSize: "18px" }}>{icon}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span style={{ fontSize: "32px", fontWeight: 600, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1 }}>{value}</span>
          {suffix && <span style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.45)" }}>{suffix}</span>}
        </div>
        {trend && <div style={{ marginTop: "8px", fontSize: "12px", color: trendColor, display: "flex", alignItems: "center", gap: "4px" }}><RiseOutlined /> {trend}</div>}
      </div>
    );
  }
  return (
    <div style={{
      backgroundColor: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: "12px",
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      height: "100%",
      boxShadow: "0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span style={{ textTransform: "uppercase", fontSize: "11px", fontWeight: 600, color: "#6b7280", letterSpacing: "0.5px" }}>{title}</span>
        {icon && <span style={{ color: "#9ca3af", fontSize: "18px" }}>{icon}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span style={{ fontSize: "32px", fontWeight: 600, color: "rgba(0,0,0,0.88)", letterSpacing: "-0.5px", lineHeight: 1 }}>{value}</span>
        {suffix && <span style={{ fontSize: "14px", color: "#6b7280" }}>{suffix}</span>}
      </div>
      {trend && <div style={{ marginTop: "8px", fontSize: "12px", color: trendColor, display: "flex", alignItems: "center", gap: "4px" }}><RiseOutlined /> {trend}</div>}
    </div>
  );
};

const DetailRow = ({ label, value, valueColor, isDark, border = true }: any) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      paddingBottom: border ? 12 : 0,
      borderBottom: border ? (isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e5e7eb") : "none",
    }}
  >
    <span style={{ color: isDark ? "rgba(255,255,255,0.45)" : "#6b7280", fontSize: 13 }}>{label}</span>
    <span style={{ fontSize: 16, fontWeight: 600, color: valueColor ?? (isDark ? "#fff" : "rgba(0,0,0,0.88)") }}>{value}</span>
  </div>
);

export const DashboardPage: React.FC = () => {
  const { mode } = useContext(ColorModeContext);
  const isDark = mode === "dark";

  const [stats, setStats] = useState<DashboardStats>({
    total_users: 0,
    total_journeys: 0,
    new_users_last_30d: 0,
    journeys_created_24h: 0,
    activation_rate: 0,
    api_errors_24h: 0,
    total_transcriptions: 0,
    openai_transcriptions: 0,
    gemini_transcriptions: 0,
    avg_transcription_duration_seconds: 0,
    longest_transcription_duration_seconds: 0,
    total_transcription_estimated_cost_usd: 0,
    transcription_duration_coverage: 0,
    transcription_cost_coverage: 0,
    total_ai_summaries: 0,
    openai_summaries: 0,
    gemini_summaries: 0,
  });
  
  const [rawChartData, setRawChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"7" | "14" | "30" | "custom">("7");
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const today = dayjs().format("YYYY-MM-DD");
        const from = dayjs().subtract(90, "day").format("YYYY-MM-DD");

        const { data: statsData, error: statsError } = await supabaseClient
          .from("admin_dashboard_stats")
          .select("*")
          .single();
        if (statsError) throw statsError;

        const { data: chartRes, error: chartError } = await supabaseClient
          .from("admin_chart_data")
          .select("*")
          .gte("date", from)
          .lte("date", today)
          .order("date", { ascending: true });
        if (chartError) throw chartError;

        if (statsData) {
          setStats({
            total_users: Number(statsData.total_users ?? statsData.res_total_users ?? 0),
            total_journeys: Number(statsData.total_journeys ?? statsData.res_total_journeys ?? 0),
            new_users_last_30d: Number(statsData.new_users_last_30d ?? statsData.res_new_users ?? 0),
            journeys_created_24h: Number(statsData.journeys_created_24h ?? statsData.res_journeys_24h ?? 0),
            activation_rate: Number(statsData.activation_rate ?? statsData.res_activation_rate ?? 0),
            api_errors_24h: Number(statsData.api_errors_24h ?? statsData.res_api_errors_24h ?? 0),
            total_transcriptions: Number(statsData.total_transcriptions ?? statsData.res_total_transcriptions ?? 0),
            openai_transcriptions: Number(statsData.openai_transcriptions ?? statsData.res_openai_transcriptions ?? 0),
            gemini_transcriptions: Number(statsData.gemini_transcriptions ?? statsData.res_gemini_transcriptions ?? 0),
            avg_transcription_duration_seconds: Number(statsData.avg_transcription_duration_seconds ?? statsData.res_avg_transcription_duration_seconds ?? 0),
            longest_transcription_duration_seconds: Number(statsData.longest_transcription_duration_seconds ?? statsData.res_longest_transcription_duration_seconds ?? 0),
            total_transcription_estimated_cost_usd: Number(statsData.total_transcription_estimated_cost_usd ?? statsData.res_total_transcription_estimated_cost_usd ?? 0),
            transcription_duration_coverage: Number(statsData.transcription_duration_coverage ?? statsData.res_transcription_duration_coverage ?? 0),
            transcription_cost_coverage: Number(statsData.transcription_cost_coverage ?? statsData.res_transcription_cost_coverage ?? 0),
            total_ai_summaries: Number(statsData.total_ai_summaries ?? statsData.res_total_ai_summaries ?? 0),
            openai_summaries: Number(statsData.openai_summaries ?? statsData.res_openai_summaries ?? 0),
            gemini_summaries: Number(statsData.gemini_summaries ?? statsData.res_gemini_summaries ?? 0),
          });
        }
        setRawChartData(
          (chartRes ?? []).map((item) => ({
            ...item,
            metric: normalizeChartMetric(item.metric ?? item.res_metric),
          }))
        );
      } catch (err: any) {
        console.error("Dashboard Fetch Error:", err);
        setErrorMsg(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const { chartRangeStart, chartRangeEnd } = useMemo(() => {
    const end = dayjs().endOf("day").toDate();
    if (chartPeriod === "custom" && customRange?.[0] && customRange?.[1]) {
      return {
        chartRangeStart: customRange[0].startOf("day").toDate(),
        chartRangeEnd: customRange[1].endOf("day").toDate(),
      };
    }
    const days = chartPeriod === "7" ? 7 : chartPeriod === "14" ? 14 : 30;
    return {
      chartRangeStart: dayjs().subtract(days - 1, "day").startOf("day").toDate(),
      chartRangeEnd: end,
    };
  }, [chartPeriod, customRange]);

  const chartData = useMemo(
    () => fillMissingDatesInRange(rawChartData, chartRangeStart, chartRangeEnd),
    [rawChartData, chartRangeStart, chartRangeEnd]
  );

  const gridStroke = isDark ? "rgba(255, 255, 255, 0.06)" : "#e5e7eb";
  const axisStroke = isDark ? "rgba(255, 255, 255, 0.08)" : "#d1d5db";
  const textColor = isDark ? "rgba(255,255,255,0.65)" : "#6b7280";
  const formatDateLabel = (dateStr: string) => {
    const parsed = dayjs(dateStr);
    return parsed.isValid() ? parsed.format("MMM D") : dateStr;
  };
  const chartConfig = {
    data: chartData,
    xField: "date",
    yField: "value",
    seriesField: "metric",
    smooth: true,
    color: ({ metric }: { metric: ChartMetric }) => CHART_METRIC_COLORS[metric],
    line: {
      size: 2.5,
      style: { lineCap: "round", lineJoin: "round" },
    },
    point: {
      size: 3,
      shape: "circle",
      style: ({ metric }: { metric: ChartMetric }) => ({
        fill: CHART_METRIC_COLORS[metric],
        stroke: isDark ? "#16181D" : "#ffffff",
        lineWidth: 2,
      }),
    },
    legend: {
      position: "top",
    },
    tooltip: {
      title: (title: string) => {
        const parsed = dayjs(title);
        return parsed.isValid() ? parsed.format("ddd, MMM D, YYYY") : title;
      },
      formatter: (datum: { metric: ChartMetric; value: number }) => ({
        name: CHART_METRIC_LABELS[datum.metric],
        value: String(datum.value),
      }),
      domStyles: {
        "g2-tooltip": {
          padding: "10px 14px",
          borderRadius: "8px",
          boxShadow: isDark ? "0 4px 12px rgba(0,0,0,0.4)" : "0 4px 12px rgba(0,0,0,0.12)",
          fontSize: "13px",
        },
        "g2-tooltip-title": {
          marginBottom: "6px",
          fontWeight: 600,
          color: textColor,
        },
        "g2-tooltip-list-item": {
          alignItems: "center",
        },
      },
    },
    padding: [24, 24, 48, 56],
    grid: {
      line: { style: { stroke: gridStroke, lineDash: [4, 4] } },
    },
    xAxis: {
      tickCount: 6,
      label: {
        autoHide: true,
        autoRotate: false,
        formatter: (v: string) => formatDateLabel(v),
        style: { fill: textColor, fontSize: 11 },
      },
      line: { style: { stroke: axisStroke } },
      range: [0, 1],
    },
    yAxis: {
      min: 0,
      tickCount: 5,
      label: {
        formatter: (v: string) => Math.round(Number(v)).toString(),
        style: { fill: textColor, fontSize: 11 },
      },
      grid: { line: { style: { stroke: gridStroke, lineDash: [4, 4] } } },
    },
    height: 280,
    animation: {
      appear: {
        duration: 800,
        easing: "easeOutCubic",
      },
    },
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}><Spin size="large" /></div>;
  }

  if (errorMsg) {
    return <div style={{ padding: 24 }}><Alert type="error" message="Помилка завантаження" description={errorMsg} /></div>;
  }

  // Розрахунок здоров'я системи (базується на кількості помилок за 24г)
  const isHealthy = stats.api_errors_24h === 0;
  const healthValue = isHealthy ? "100%" : `${Math.max(100 - (stats.api_errors_24h * 5), 0).toFixed(1)}%`; // -5% за кожну помилку
  const healthTrend = isHealthy ? "All systems operational" : `${stats.api_errors_24h} errors in last 24h`;
  const transcriptionAvgDuration = formatDuration(stats.avg_transcription_duration_seconds);
  const transcriptionLongestDuration = formatDuration(stats.longest_transcription_duration_seconds);
  const transcriptionCostLabel = stats.transcription_cost_coverage > 0
    ? formatCurrency(stats.total_transcription_estimated_cost_usd)
    : "Not tracked";
  const transcriptionTrend = stats.transcription_duration_coverage > 0
    ? `${transcriptionAvgDuration} avg recording`
    : "Duration metadata pending";
  const summaryTrend = stats.total_ai_summaries > 0
    ? `${stats.gemini_summaries} via Gemini`
    : "No AI summaries yet";

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 24, color: isDark ? undefined : "rgba(0,0,0,0.88)" }}>Admin Dashboard</h1>
      
      {/* Cards */}
      <Row gutter={[16, 16]}>
        <Col flex="1 1 220px">
          <StatCard 
            title="Total Users" 
            value={stats.total_users} 
            icon={<UserOutlined />}
            trend="+12% this month"
            isDark={isDark}
          />
        </Col>
        <Col flex="1 1 220px">
          <StatCard 
            title="Total Journeys" 
            value={stats.total_journeys} 
            icon={<GlobalOutlined />}
            trend="+5% this week"
            isDark={isDark}
          />
        </Col>
        <Col flex="1 1 220px">
          <StatCard 
            title="New Users (30d)" 
            value={stats.new_users_last_30d} 
            icon={<RiseOutlined />} 
            trend="Active Growth"
            trendColor="#3E7BFA"
            isDark={isDark}
          />
        </Col>
        <Col flex="1 1 220px">
          <StatCard 
            title="Total Transcriptions" 
            value={stats.total_transcriptions} 
            icon={<FileTextOutlined />}
            trend={transcriptionTrend}
            trendColor="#F59E0B"
            isDark={isDark}
          />
        </Col>
        <Col flex="1 1 220px">
          <StatCard 
            title="System Health" 
            value={healthValue} 
            icon={<CloudServerOutlined />} 
            suffix="Uptime"
            trend={healthTrend}
            trendColor={isHealthy ? "#4ADE80" : "#ef4444"}
            isDark={isDark}
          />
        </Col>
        <Col flex="1 1 220px">
          <StatCard
            title="AI Summaries"
            value={stats.total_ai_summaries}
            icon={<FileTextOutlined />}
            trend={summaryTrend}
            trendColor="#8B5CF6"
            isDark={isDark}
          />
        </Col>
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col span={16}>
          <Card 
            className="dashboard-user-growth-chart"
            title="Platform Activity Trends" 
            extra={
              <Space wrap size="middle" align="center">
                <Segmented
                  value={chartPeriod}
                  onChange={(v) => setChartPeriod((v as "7" | "14" | "30" | "custom") ?? "30")}
                  options={[
                    { label: "7 days", value: "7" },
                    { label: "14 days", value: "14" },
                    { label: "30 days", value: "30" },
                    { label: "Custom", value: "custom" },
                  ]}
                />
                {chartPeriod === "custom" && (
                  <RangePicker
                    value={customRange}
                    onChange={(dates) => setCustomRange(dates ?? null)}
                    maxDate={dayjs()}
                    allowClear
                    suffixIcon={<CalendarOutlined />}
                    style={{ width: 260 }}
                  />
                )}
              </Space>
            }
            style={{ overflow: "hidden" }}
          >
             <Line {...chartConfig} />
          </Card>
        </Col>
        <Col span={8}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card title="Product Health">
               <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <DetailRow
                    label="Activation Rate (24h)"
                    value={`${stats.activation_rate}%`}
                    isDark={isDark}
                  />
                  <DetailRow
                    label="API Errors (24h)"
                    value={stats.api_errors_24h}
                    valueColor={stats.api_errors_24h > 0 ? "#ef4444" : "#22c55e"}
                    isDark={isDark}
                  />
                  <DetailRow
                    label="Export Actions"
                    value="Not tracked"
                    valueColor={isDark ? "rgba(255,255,255,0.25)" : "#9ca3af"}
                    isDark={isDark}
                    border={false}
                  />
               </div>
            </Card>

            <Card title="Transcription Analytics">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <DetailRow
                  label="Total Transcriptions"
                  value={stats.total_transcriptions}
                  isDark={isDark}
                />
                <DetailRow
                  label="OpenAI Transcriptions"
                  value={stats.openai_transcriptions}
                  valueColor="#10b981"
                  isDark={isDark}
                />
                <DetailRow
                  label="Gemini Transcriptions"
                  value={stats.gemini_transcriptions}
                  valueColor="#f59e0b"
                  isDark={isDark}
                />
                <DetailRow
                  label="Estimated Cost"
                  value={transcriptionCostLabel}
                  valueColor={stats.transcription_cost_coverage > 0 ? "#F59E0B" : (isDark ? "rgba(255,255,255,0.25)" : "#9ca3af")}
                  isDark={isDark}
                />
                <DetailRow
                  label="Avg Recording Length"
                  value={transcriptionAvgDuration}
                  isDark={isDark}
                />
                <DetailRow
                  label="Longest Recording"
                  value={transcriptionLongestDuration}
                  isDark={isDark}
                />
                <DetailRow
                  label="Token Usage"
                  value="Not tracked"
                  valueColor={isDark ? "rgba(255,255,255,0.25)" : "#9ca3af"}
                  isDark={isDark}
                  border={false}
                />
              </div>

              <div style={{ marginTop: 16, fontSize: 12, color: isDark ? "rgba(255,255,255,0.45)" : "#6b7280", lineHeight: 1.5 }}>
                Duration coverage: {stats.transcription_duration_coverage}/{stats.total_transcriptions || 0}
                {" · "}
                Cost coverage: {stats.transcription_cost_coverage}/{stats.total_transcriptions || 0}
              </div>
            </Card>

            <Card title="Summary Analytics">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <DetailRow
                  label="Total AI Summaries"
                  value={stats.total_ai_summaries}
                  isDark={isDark}
                />
                <DetailRow
                  label="Gemini Summaries"
                  value={stats.gemini_summaries}
                  valueColor="#8b5cf6"
                  isDark={isDark}
                />
                <DetailRow
                  label="OpenAI Summaries"
                  value={stats.openai_summaries}
                  valueColor={stats.openai_summaries > 0 ? "#10b981" : (isDark ? "rgba(255,255,255,0.25)" : "#9ca3af")}
                  isDark={isDark}
                  border={false}
                />
              </div>
            </Card>
          </div>
        </Col>
      </Row>
    </div>
  );
};
