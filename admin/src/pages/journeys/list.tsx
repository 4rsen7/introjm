import { List, useTable, DateField } from "@refinedev/antd";
import { Table, Space } from "antd";

export const JourneyList = () => {
  // Цей хук сам піде в Supabase і витягне дані з таблиці 'journeys'
  const { tableProps } = useTable({
    resource: "journeys",
    meta: {
        select: "*", // Тягнемо всі поля
    }
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        {/* Колонка ID */}
        <Table.Column dataIndex="id" title="ID" width={80} />
        
        {/* Колонка Назви (Title) - береться з JSON map_data */}
        <Table.Column 
            dataIndex="title" 
            title="Назва" 
            render={(value, record: any) => {
                // Якщо title лежить в корені - показуємо його
                // Якщо в map_data - треба діставати звідти (залежить від твоєї структури)
                return record.title || record.map_data?.title || "Без назви"; 
            }}
        />

        {/* Колонка Дати */}
        <Table.Column
          dataIndex="created_at"
          title="Створено"
          render={(value: any) => <DateField value={value} format="DD.MM.YYYY HH:mm" />}
          width={200}
        />
        
        {/* Колонка Власника (User ID) */}
        <Table.Column dataIndex="user_id" title="User ID" />
      </Table>
    </List>
  );
};