import React from "react";
import { List, useTable, EditButton, DeleteButton, CreateButton } from "@refinedev/antd";
import { Table, Space, Tag } from "antd";

export const LearningMaterialList: React.FC = () => {
  const { tableProps } = useTable({
    resource: "learning_materials",
    sorters: {
      initial: [
        { field: "featured", order: "desc" },
        { field: "sort_order", order: "asc" },
        { field: "updated_at", order: "desc" },
      ],
    },
    meta: {
      select: "*",
    },
  });

  return (
    <List headerButtons={() => <CreateButton />}>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="title" title="Title" />
        <Table.Column dataIndex="slug" title="Slug" />
        <Table.Column dataIndex="category" title="Category" />
        <Table.Column
          dataIndex="status"
          title="Status"
          render={(value: string) => <Tag color={value === "published" ? "green" : "gold"}>{value || "draft"}</Tag>}
        />
        <Table.Column
          dataIndex="featured"
          title="Featured"
          render={(value: boolean) => <Tag color={value ? "blue" : "default"}>{value ? "Yes" : "No"}</Tag>}
        />
        <Table.Column dataIndex="reading_time_minutes" title="Read Time" render={(value: number | null) => value ? `${value} min` : "—"} />
        <Table.Column dataIndex="updated_at" title="Updated" render={(value: string) => value ? new Date(value).toLocaleString() : "—"} />
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
