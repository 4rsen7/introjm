import React, { useState, useEffect } from "react";
import { List, useTable, DeleteButton } from "@refinedev/antd";
import { Table, Space, Tag, Button, Dropdown, Drawer, Descriptions, Divider, Spin, Form, Select, Radio, DatePicker, App } from "antd";
import { MoreOutlined, StopOutlined, KeyOutlined, EyeOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../providers/supabase-client";
import dayjs from "dayjs";
import { API_BASE_URL } from "../../providers/constants";

type PlanOption = {
    id: string;
    name: string;
    price_monthly: number | null;
};

type PlanAssignmentValues = {
    planId: string;
    durationMode: string;
    customDate?: dayjs.Dayjs | null;
};

type AdminUserStatsRow = {
    id: string;
    total_journeys: number;
    total_personas: number;
    total_metrics: number;
};

type OwnedWorkspace = {
    id: string;
    name: string;
    workspace_members: Array<{ count: number }>;
};

type JoinedWorkspace = {
    role: string;
    workspaces: {
        id: string;
        name: string;
    };
};

type SubscriptionRecord = {
    id: string;
    status?: string | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean | null;
    plans?: {
        name?: string | null;
        price_monthly?: number | null;
    } | null;
};

type UserDetails = {
    profile: {
        full_name?: string | null;
        email?: string | null;
        created_at: string;
        role?: string | null;
    };
    owned_workspaces: OwnedWorkspace[];
    joined_workspaces: JoinedWorkspace[];
    subscriptions: SubscriptionRecord[];
};

const getSubscriptionStatusMeta = (subscription: SubscriptionRecord) => {
    const status = String(subscription?.status || '').toLowerCase();
    const periodEnd = subscription?.current_period_end ? dayjs(subscription.current_period_end) : null;
    const isExpired = periodEnd ? periodEnd.isBefore(dayjs()) : false;

    if (status === 'canceled') {
        return { color: 'default', label: 'Canceled' };
    }

    if (status === 'active' && isExpired) {
        return { color: 'volcano', label: 'Expired' };
    }

    if (status === 'active' && subscription?.cancel_at_period_end) {
        return { color: 'gold', label: 'Active until period end' };
    }

    if (status === 'active') {
        return { color: 'green', label: 'Active' };
    }

    if (!status) {
        return { color: 'default', label: 'Unknown' };
    }

    return {
        color: 'default',
        label: status.charAt(0).toUpperCase() + status.slice(1),
    };
};

// Sub-component to fix "useForm not connected" warning
const PlanAssignmentForm: React.FC<{ 
    plans: PlanOption[];
    onAssign: (values: PlanAssignmentValues) => Promise<void>;
    loading: boolean; 
}> = ({ plans, onAssign, loading }) => {
    const [form] = Form.useForm();
    const durationMode = Form.useWatch('durationMode', form);

    return (
        <Form form={form} layout="vertical" onFinish={onAssign} initialValues={{ durationMode: '30' }}>
            <Form.Item name="planId" label="Select Plan" rules={[{ required: true }]}>
                <Select placeholder="Choose a plan">
                    {plans.map(p => (
                        <Select.Option key={p.id} value={p.id}>{p.name} (${p.price_monthly}/mo)</Select.Option>
                    ))}
                </Select>
            </Form.Item>
            
            <Form.Item name="durationMode" label="Duration">
                <Radio.Group>
                    <Radio.Button value="30">30 Days</Radio.Button>
                    <Radio.Button value="60">60 Days</Radio.Button>
                    <Radio.Button value="90">90 Days</Radio.Button>
                    <Radio.Button value="180">180 Days</Radio.Button>
                    <Radio.Button value="custom">Custom</Radio.Button>
                </Radio.Group>
            </Form.Item>

            {durationMode === 'custom' && (
                <Form.Item name="customDate" label="End Date" rules={[{ required: true }]}>
                    <DatePicker style={{ width: '100%' }} />
                </Form.Item>
            )}

            <Button type="primary" htmlType="submit" loading={loading} block>
                Assign Plan
            </Button>
        </Form>
    );
};

export const UserList: React.FC = () => {
  const { tableProps } = useTable({
    resource: "admin_users_stats", // Використовуємо наше SQL View
    syncWithLocation: true,
  });
  
  // Fix for static message warning
  const { message } = App.useApp();

  // --- DRAWER STATE ---
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [plans, setPlans] = useState<PlanOption[]>([]);

  // --- PLAN ASSIGNMENT STATE ---
  const [assigning, setAssigning] = useState(false);

  // Fetch Plans for Dropdown
  useEffect(() => {
    const fetchPlans = async () => {
        const { data } = await supabaseClient.from('plans').select('*').eq('is_active', true);
        if (data) setPlans(data as PlanOption[]);
    };
    fetchPlans();
  }, []);

  // Fetch User Details when Drawer Opens
  useEffect(() => {
    if (selectedUserId && isDrawerOpen) {
        setLoadingDetails(true);
        const fetchDetails = async () => {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                setLoadingDetails(false);
                message.error("Please log in to view user details");
                return;
            }

            try {
                console.log(`Fetching user details from: ${API_BASE_URL}/users-manage/${selectedUserId}`);
                
                const res = await fetch(`${API_BASE_URL}/users-manage/${selectedUserId}`, {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    const errMsg = errorData.message || errorData.error || `Request failed with status ${res.status}`;
                    throw new Error(errMsg);
                }

                const json = await res.json();
                if (json.status === 'success') {
                    setUserDetails(json.data);
                }
            } catch (e) {
                console.error(e);
                const text = e instanceof Error ? e.message : "Failed to load user details";
                message.error(text);
            } finally {
                setLoadingDetails(false);
            }
        };
        fetchDetails();
    }
  }, [selectedUserId, isDrawerOpen, message]);

  const handleAssignPlan = async (values: PlanAssignmentValues) => {
      setAssigning(true);
      const { data: { session } } = await supabaseClient.auth.getSession();
      try {
          const res = await fetch(`${API_BASE_URL}/users-manage/assign-plan`, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${session?.access_token}` 
              },
              body: JSON.stringify({
                  userId: selectedUserId,
                  planId: values.planId,
                  durationDays: values.durationMode === 'custom' ? null : values.durationMode,
                  customEndDate: values.durationMode === 'custom' ? values.customDate : null
              })
          });
          if (res.ok) {
              message.success("Plan assigned successfully");
              // Refresh details
              setSelectedUserId(null); // Force re-fetch trigger hack or just close
              setIsDrawerOpen(false);
          } else {
              message.error("Failed to assign plan");
          }
      } catch (e) {
          console.error(e);
      } finally {
          setAssigning(false);
      }
  };

  // Дії для дропдауна
  const getMenu = (record: { id: string }) => ({
    items: [
      { 
          key: 'view', 
          label: 'View Details', 
          icon: <EyeOutlined />, 
          onClick: () => { setSelectedUserId(record.id); setIsDrawerOpen(true); } 
      },
      { key: 'reset', label: 'Reset Password', icon: <KeyOutlined /> },
      { key: 'ban', label: 'Ban User', icon: <StopOutlined />, danger: true },
    ]
  });

  return (
    <>
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="email" title="Email" />
        <Table.Column dataIndex="full_name" title="Name" />
        
        <Table.Column 
          dataIndex="plan_status" 
          title="Plan" 
          render={(value) => {
            const v = value || '—';
            const color = v === 'Pro' ? 'gold' : v === 'Enterprise' ? 'purple' : v === 'Starter' ? 'blue' : 'default';
            return <Tag color={color}>{v}</Tag>;
          }}
        />

        <Table.Column 
            title="Usage (J/P/M)" 
            render={(_, record: AdminUserStatsRow) => (
                <span>{record.total_journeys} / {record.total_personas} / {record.total_metrics}</span>
            )}
        />

        <Table.Column 
            dataIndex="is_activated" 
            title="Activated" 
            render={(value) => (
                <Tag color={value ? 'green' : 'default'}>{value ? 'Yes' : 'No'}</Tag>
            )}
        />

        <Table.Column dataIndex="created_at" title="Joined" render={(value) => new Date(value).toLocaleDateString()} />

        <Table.Column
          title="Actions"
          dataIndex="actions"
          render={(_, record: { id: string }) => (
            <Space>
              <Dropdown menu={getMenu(record)}>
                 <Button icon={<MoreOutlined />} />
              </Dropdown>
              {/* Refine Delete Button (GDPR) */}
              <DeleteButton hideText size="small" recordItemId={record.id} resource="profiles" />
            </Space>
          )}
        />
      </Table>
    </List>

    <Drawer
        title="User Details & Billing"
        width={600}
        onClose={() => setIsDrawerOpen(false)}
        open={isDrawerOpen}
    >
        {loadingDetails || !userDetails ? (
            <div style={{ textAlign: 'center', padding: 50 }}><Spin /></div>
        ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* 1. General Info */}
                <Descriptions title="User Information" column={1} bordered size="small">
                    <Descriptions.Item label="Full Name">{userDetails.profile.full_name}</Descriptions.Item>
                    <Descriptions.Item label="Email">{userDetails.profile.email}</Descriptions.Item>
                    <Descriptions.Item label="Registered">{new Date(userDetails.profile.created_at).toLocaleString()}</Descriptions.Item>
                    <Descriptions.Item label="Role">{userDetails.profile.role}</Descriptions.Item>
                </Descriptions>

                {/* 2. Workspace Info */}
                <Descriptions title="Workspace" column={1} bordered size="small">
                    {userDetails.owned_workspaces.length > 0 ? (
                        userDetails.owned_workspaces.map((ws) => (
                            <React.Fragment key={ws.id}>
                                <Descriptions.Item label="Owns Workspace">
                                    {ws.name} ({ws.workspace_members[0].count} members)
                                </Descriptions.Item>
                            </React.Fragment>
                        ))
                    ) : (
                        <Descriptions.Item label="Owns Workspace"><Tag color="orange">No Workspace</Tag></Descriptions.Item>
                    )}
                    
                    {userDetails.joined_workspaces.length > 0 && (
                         userDetails.joined_workspaces.map((ws) => (
                            <Descriptions.Item key={ws.workspaces.id} label="Joined Workspace">
                                {ws.workspaces.name} (Role: {ws.role})
                            </Descriptions.Item>
                        ))
                    )}
                </Descriptions>

                <Divider />

                {/* 3. Plan Assignment */}
                <div>
                    <h3>Assign Plan</h3>
                    <PlanAssignmentForm plans={plans} onAssign={handleAssignPlan} loading={assigning} />
                </div>

                <Divider />

                {/* 4. Billing History */}
                <div>
                    <h3>Billing History</h3>
                    <Table 
                        dataSource={userDetails.subscriptions} 
                        rowKey="id" 
                        pagination={false} 
                        size="small"
                        columns={[
                            { title: 'Plan', dataIndex: ['plans', 'name'] },
                            {
                                title: 'Status',
                                dataIndex: 'status',
                                render: (_, record: SubscriptionRecord) => {
                                    const meta = getSubscriptionStatusMeta(record);
                                    return <Tag color={meta.color}>{meta.label}</Tag>;
                                }
                            },
                            { title: 'Start', dataIndex: 'current_period_start', render: (val) => dayjs(val).format('DD MMM YYYY') },
                            { title: 'End', dataIndex: 'current_period_end', render: (val) => val ? dayjs(val).format('DD MMM YYYY') : 'Forever' },
                        ]}
                    />
                </div>
            </div>
        )}
    </Drawer>
    </>
  );
};
