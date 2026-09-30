import React from "react";
import { List, useTable, EditButton } from "@refinedev/antd";
import { Table, Space, Tag } from "antd";

export const WorkspaceList: React.FC = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="id" title="ID" width={200} />
        <Table.Column dataIndex="name" title="Name" />
        <Table.Column dataIndex="owner_id" title="Owner ID" />
        <Table.Column
          title="Actions"
          dataIndex="actions"
          render={(_, record: any) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
