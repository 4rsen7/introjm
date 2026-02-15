import React, { useContext, useEffect, useState, useMemo } from "react";
import { Row, Col, Card, Spin, Alert, Segmented, DatePicker, Space } from "antd";
import type { Dayjs } from "dayjs";
import { UserOutlined, GlobalOutlined, RiseOutlined, CloudServerOutlined, CalendarOutlined } from "@ant-design/icons";
import { Area } from "@ant-design/plots";
import dayjs from "dayjs";
import { supabaseClient } from "../../providers/supabase-client";
import { ColorModeContext } from "../../contexts/color-mode";

const { RangePicker } = DatePicker;

interface DashboardStats {
  total_users: number;
  total_journeys: number;
  new_users_last_30d: number;
  journeys_created_24h: number;
  activation_rate: number;
  api_errors_24h: number;
  res_total_users?: number;
  res_total_journeys?: number;
  res_new_users?: number;
  res_journeys_24h?: number;
  res_activation_rate?: number;
  res_api_errors_24h?: number;
}

interface ChartData {
  date: string;
  value: number;
}

// Заповнюємо всі дні в діапазоні [start, end], значення з data або 0
function fillMissingDatesInRange(
  data: any[],
  start: Date,
  end: Date
): ChartData[] {
  const filled: ChartData[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endTime = new Date(end);
  endTime.setHours(0, 0, 0, 0);
  while (cur <= endTime) {
    const dateStr = cur.toISOString().split("T")[0];
    const found = data.find(
      (item) => (item.date === dateStr) || (item.res_date === dateStr)
    );
    filled.push({
      date: dateStr,
      value: found ? Number(found.value ?? found.res_value) : 0,
    });
    cur.setDate(cur.getDate() + 1);
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

export const DashboardPage: React.FC = () => {
  const { mode } = useContext(ColorModeContext);
  const isDark = mode === "dark";

  const [stats, setStats] = useState<DashboardStats>({
    total_users: 0,
    total_journeys: 0,
    new_users_last_30d: 0,
    journeys_created_24h: 0,
    activation_rate: 0,
    api_errors_24h: 0
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
          });
        }
        setRawChartData(chartRes ?? []);
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
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const chartConfig = {
    data: chartData,
    xField: "date",
    yField: "value",
    smooth: true,
    color: "#3E7BFA",
    line: {
      size: 2.5,
      style: { lineCap: "round", lineJoin: "round" },
    },
    areaStyle: () => ({
      fill: "l(270) 0:#3E7BFA 0.5:rgba(62, 123, 250, 0.25) 1:rgba(62, 123, 250, 0.02)",
    }),
    point: {
      size: 4,
      shape: "circle",
      style: {
        fill: "#3E7BFA",
        stroke: isDark ? "#16181D" : "#ffffff",
        lineWidth: 2,
      },
    },
    tooltip: {
      title: (title: string) => {
        const d = new Date(title);
        return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      },
      formatter: (datum: { value: number }) => ({
        name: "Registrations",
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
        style: { fill: "#ffffff", fontSize: 11 },
      },
      line: { style: { stroke: axisStroke } },
      range: [0, 1],
    },
    yAxis: {
      min: 0,
      tickCount: 5,
      label: {
        formatter: (v: string) => Math.round(Number(v)).toString(),
        style: { fill: "#ffffff", fontSize: 11 },
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

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 24, color: isDark ? undefined : "rgba(0,0,0,0.88)" }}>Admin Dashboard</h1>
      
      {/* Cards */}
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <StatCard 
            title="Total Users" 
            value={stats.total_users} 
            icon={<UserOutlined />}
            trend="+12% this month"
            isDark={isDark}
          />
        </Col>
        <Col span={6}>
          <StatCard 
            title="Total Journeys" 
            value={stats.total_journeys} 
            icon={<GlobalOutlined />}
            trend="+5% this week"
            isDark={isDark}
          />
        </Col>
        <Col span={6}>
          <StatCard 
            title="New Users (30d)" 
            value={stats.new_users_last_30d} 
            icon={<RiseOutlined />} 
            trend="Active Growth"
            trendColor="#3E7BFA"
            isDark={isDark}
          />
        </Col>
        <Col span={6}>
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
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col span={16}>
          <Card 
            className="dashboard-user-growth-chart"
            title="User Growth (Registrations)" 
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
             <Area {...chartConfig} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Product Health">
             <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e5e7eb" }}>
                  <span style={{ color: isDark ? "rgba(255,255,255,0.45)" : "#6b7280", fontSize: 13 }}>Activation Rate (24h)</span>
                  <span style={{ fontSize: 18, fontWeight: 600, color: isDark ? "#fff" : "rgba(0,0,0,0.88)" }}>{stats.activation_rate}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e5e7eb" }}>
                  <span style={{ color: isDark ? "rgba(255,255,255,0.45)" : "#6b7280", fontSize: 13 }}>API Errors (24h)</span>
                  <span style={{ fontSize: 18, fontWeight: 600, color: stats.api_errors_24h > 0 ? "#ef4444" : "#22c55e" }}>{stats.api_errors_24h}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: isDark ? "rgba(255,255,255,0.45)" : "#6b7280", fontSize: 13 }}>Export Actions</span>
                  <span style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.25)" : "#9ca3af" }}>Not tracked</span>
                </div>
             </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};