import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function TaskResultsChart({ tasks, statuses, labels, colors }) {
  return <div className="h-full overflow-x-auto"><div style={{ height: '100%', minWidth: Math.max(280, tasks.length * 56) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={tasks.map((task, index) => ({ name: `${index + 1}`, ...task.counts }))} margin={{ top: 8, right: 12, left: -20, bottom: 8 }} barSize={36}>
    <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 4" />
    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={6} />
    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} domain={[0, Math.max(1, ...tasks.map(task => Object.values(task.counts).reduce((sum, count) => sum + count, 0)))]} />
    <Tooltip labelFormatter={value => tasks[Number(value) - 1]?.title || value} contentStyle={{ borderRadius: 14, borderColor: '#e2e8f0', fontSize: 12, maxWidth: 280, whiteSpace: 'normal' }} cursor={{ fill: '#f1f5f9', opacity: 0.6 }} />
    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />
    {statuses.map((status, index) => <Bar key={status} dataKey={status} name={labels[index]} stackId="results" fill={colors[index]} isAnimationActive={false} />)}
  </BarChart></ResponsiveContainer></div></div>;
}
