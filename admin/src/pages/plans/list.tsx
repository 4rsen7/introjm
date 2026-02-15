import React from "react";
import { List, useTable, EditButton, DeleteButton, CreateButton } from "@refinedev/antd";
import { Table, Space, Tag } from "antd";

export const PlanList: React.FC = () => {
  const { tableProps } = useTable({
    resource: "plans",
    sorters: { initial: [{ field: "tier", order: "asc" }] }
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="name" title="Name" />
        <Table.Column 
            dataIndex="price_monthly" 
            title="Price (Mo)" 
            render={(val) => `$${val}`}
        />
        <Table.Column 
            dataIndex="is_active" 
            title="Status" 
            render={(val) => <Tag color={val ? "green" : "red"}>{val ? "Active" : "Inactive"}</Tag>}
        />
        <Table.Column dataIndex="tier" title="Tier Level" />
        <Table.Column dataIndex="max_members" title="Max Members" render={(v: number | null) => v ?? "—"} />
        <Table.Column dataIndex="max_journeys" title="Max Journeys" render={(v: number | null) => v ?? "—"} />
        <Table.Column dataIndex="max_personas" title="Max Personas" render={(v: number | null) => v ?? "—"} />
        <Table.Column dataIndex="max_metrics" title="Max Metrics" render={(v: number | null) => v ?? "—"} />
        <Table.Column
          title="Actions"
          dataIndex="actions"
          render={(_, record: any) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <DeleteButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
