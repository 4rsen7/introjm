// src/data/mockMetrics.js

export const MOCK_METRICS = [
  {
    id: 1,
    name: "NPS Score",
    type: "number",
    updated: "2 days ago",
    linkedMaps: 3,
    value: 72,
    suffix: "",
    trend: "up"
  },
  {
    id: 2,
    name: "Conversion Rate",
    type: "comparison",
    updated: "Yesterday",
    linkedMaps: 1,
    value: 4.5,
    previousValue: 3.8,
    suffix: "%",
    trend: "up"
  },
  {
    id: 3,
    name: "Monthly Active Users",
    type: "series",
    updated: "5 days ago",
    linkedMaps: 0,
    data: [
      { label: 'Jan', value: 1200 },
      { label: 'Feb', value: 1350 },
      { label: 'Mar', value: 1280 },
      { label: 'Apr', value: 1500 },
      { label: 'May', value: 1650 }
    ]
  },
  {
    id: 4,
    name: "Churn Rate",
    type: "number",
    updated: "1 week ago",
    linkedMaps: 2,
    value: 2.1,
    suffix: "%",
    trend: "down"
  }
];