import React from "react";
import { List, useTable, EditButton, DeleteButton } from "@refinedev/antd";
import { Table, Space, Tag } from "antd";

type PlanRecord = {
  id: string;
};

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
        <Table.Column dataIndex="max_members" title="Members Cap" render={(v: number | null) => v ?? "—"} />
        <Table.Column dataIndex="max_journeys" title="Journeys Cap" render={(v: number | null) => v ?? "—"} />
        <Table.Column dataIndex="max_personas" title="Personas Cap" render={(v: number | null) => v ?? "—"} />
        <Table.Column dataIndex="max_metrics" title="Metrics Cap" render={(v: number | null) => v ?? "—"} />
        <Table.Column dataIndex="max_interviews" title="Interview Quota / Period" render={(v: number | null) => v ?? "—"} />
        <Table.Column dataIndex="max_portraits_per_period" title="Portrait Quota / Period" render={(v: number | null) => v ?? "—"} />
        <Table.Column dataIndex="max_ai_summaries_per_period" title="AI Insights / Period" render={(v: number | null) => v ?? "—"} />
        <Table.Column dataIndex="max_exports_per_period" title="PDF Exports / Period" render={(v: number | null) => v ?? "—"} />
        <Table.Column
          title="Actions"
          dataIndex="actions"
          render={(_, record: PlanRecord) => (
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
