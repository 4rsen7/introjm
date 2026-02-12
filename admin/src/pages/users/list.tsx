import React from "react";
import { List, useTable, EditButton, DeleteButton } from "@refinedev/antd";
import { Table, Space, Tag, Button, Dropdown } from "antd";
import { MoreOutlined, StopOutlined, KeyOutlined } from "@ant-design/icons";

export const UserList: React.FC = () => {
  const { tableProps } = useTable({
    resource: "admin_users_stats", // Використовуємо наше SQL View
    syncWithLocation: true,
  });

  // Дії для дропдауна
  const getMenu = (record: any) => ({
    items: [
      { key: '1', label: 'Reset Password', icon: <KeyOutlined /> },
      { key: '2', label: 'Ban User', icon: <StopOutlined />, danger: true },
    ]
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="email" title="Email" />
        <Table.Column dataIndex="full_name" title="Name" />
        
        <Table.Column 
          dataIndex="plan_status" 
          title="Plan" 
          render={(value) => (
            <Tag color={value === 'Pro' ? 'gold' : 'blue'}>{value}</Tag>
          )}
        />

        <Table.Column 
            title="Usage (J/P/M)" 
            render={(_, record: any) => (
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
          render={(_, record: any) => (
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
  );
};
