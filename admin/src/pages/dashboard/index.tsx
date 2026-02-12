import React, { useEffect, useState } from "react";
import { Row, Col, Card, Spin, Alert } from "antd";
import { UserOutlined, GlobalOutlined, RiseOutlined, CloudServerOutlined } from "@ant-design/icons";
import { Area } from "@ant-design/plots";
// Імпортуємо клієнт напряму (перевір шлях, якщо він відрізняється)
import { supabaseClient } from "../../providers/supabase-client";

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

// Helper: Заповнюємо пропущені дати нулями за останні 30 днів
const fillMissingDates = (data: any[]): ChartData[] => {
  const filled: ChartData[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    
    // Шукаємо, чи є дані за цю дату (підтримуємо обидва формати ключів)
    const found = data.find(item => (item.date === dateStr) || (item.res_date === dateStr));
    filled.push({ date: dateStr, value: found ? Number(found.value || found.res_value) : 0 });
  }
  return filled;
};

// Custom Stat Card Component for Premium Look
const StatCard = ({ title, value, icon, trend, trendColor = "#4ADE80", suffix }: any) => (
  <div style={{
    backgroundColor: "#16181D",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "12px",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    height: "100%",
    transition: "border-color 0.2s",
  }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
      <span style={{ textTransform: "uppercase", fontSize: "11px", fontWeight: 600, color: "rgba(255, 255, 255, 0.45)", letterSpacing: "0.5px" }}>
        {title}
      </span>
      {icon && <span style={{ color: "rgba(255, 255, 255, 0.25)", fontSize: "18px" }}>{icon}</span>}
    </div>
    <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
      <span style={{ fontSize: "32px", fontWeight: 600, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1 }}>
        {value}
      </span>
      {suffix && <span style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.45)" }}>{suffix}</span>}
    </div>
    {trend && (
      <div style={{ marginTop: "8px", fontSize: "12px", color: trendColor, display: "flex", alignItems: "center", gap: "4px", textShadow: `0 0 10px ${trendColor}40` }}>
        <RiseOutlined /> {trend}
      </div>
    )}
  </div>
);

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    total_users: 0,
    total_journeys: 0,
    new_users_last_30d: 0,
    journeys_created_24h: 0,
    activation_rate: 0,
    api_errors_24h: 0
  });
  
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // 1. Отримуємо Статистику ( .single() повертає зразу об'єкт, а не масив )
        const { data: statsData, error: statsError } = await supabaseClient
          .from("admin_dashboard_stats")
          .select("*")
          .single(); // <--- Магія тут: ми кажемо Supabase, що чекаємо 1 рядок

        if (statsError) throw statsError;

        // 2. Отримуємо Графік
        const { data: chartRes, error: chartError } = await supabaseClient
          .from("admin_chart_data")
          .select("*")
          .order('date', { ascending: true });

        if (chartError) throw chartError;

        // 3. Записуємо дані (Supabase віддає чистий JSON, без зайвих обгорток)
        if (statsData) {
            setStats({
                total_users: Number(statsData.total_users || statsData.res_total_users || 0),
                total_journeys: Number(statsData.total_journeys || statsData.res_total_journeys || 0),
                new_users_last_30d: Number(statsData.new_users_last_30d || statsData.res_new_users || 0),
                journeys_created_24h: Number(statsData.journeys_created_24h || statsData.res_journeys_24h || 0),
                activation_rate: Number(statsData.activation_rate || statsData.res_activation_rate || 0),
                api_errors_24h: Number(statsData.api_errors_24h || statsData.res_api_errors_24h || 0),
            });
        }

        if (chartRes) {
            setChartData(fillMissingDates(chartRes));
        }

      } catch (err: any) {
        console.error("Dashboard Fetch Error:", err);
        setErrorMsg(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const config = {
    data: chartData,
    xField: 'date',
    yField: 'value',
    smooth: true, // Робить лінію плавною (крива Безьє)
    color: '#3E7BFA', // Колір самої лінії
    areaStyle: () => { // Градієнтна заливка під лінією
      return {
        fill: 'l(270) 0:rgba(62, 123, 250, 0.3) 1:rgba(62, 123, 250, 0.05)',
      };
    },
    grid: {
      line: {
        style: {
          stroke: 'rgba(255, 255, 255, 0.05)',
          lineDash: [4, 4],
        },
      },
    },
    xAxis: {
      label: { autoHide: true, autoRotate: false },
      line: { style: { stroke: 'rgba(255, 255, 255, 0.08)' } },
      range: [0, 1], // Розтягує графік на всю ширину
    },
    yAxis: { grid: { line: { style: { stroke: 'rgba(255, 255, 255, 0.05)', lineDash: [4, 4] } } } },
    height: 200,
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
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Admin Dashboard</h1>
      
      {/* Cards */}
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <StatCard 
            title="Total Users" 
            value={stats.total_users} 
            icon={<UserOutlined />}
            trend="+12% this month"
          />
        </Col>
        <Col span={6}>
          <StatCard 
            title="Total Journeys" 
            value={stats.total_journeys} 
            icon={<GlobalOutlined />}
            trend="+5% this week"
          />
        </Col>
        <Col span={6}>
          <StatCard 
            title="New Users (30d)" 
            value={stats.new_users_last_30d} 
            icon={<RiseOutlined />} 
            trend="Active Growth"
            trendColor="#3E7BFA"
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
          />
        </Col>
      </Row>

      {/* Charts */}
      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col span={16}>
          <Card title="User Growth (Registrations)">
             <Area {...config} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Product Health">
             <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>Activation Rate (24h)</span>
                  <span style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{stats.activation_rate}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>API Errors (24h)</span>
                  <span style={{ fontSize: 18, fontWeight: 600, color: stats.api_errors_24h > 0 ? '#ef4444' : '#22c55e' }}>{stats.api_errors_24h}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>Export Actions</span>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.25)' }}>Not tracked</span>
                </div>
             </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};