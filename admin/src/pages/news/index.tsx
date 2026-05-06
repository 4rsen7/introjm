import React, { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Card, Drawer, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, PushpinOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../providers/supabase-client";
import { API_BASE_URL } from "../../providers/constants";

const { Paragraph, Text } = Typography;

const NEWS_TONE_OPTIONS = [
  { label: "Cobalt", value: "cobalt" },
  { label: "Emerald", value: "emerald" },
  { label: "Amber", value: "amber" },
  { label: "Rose", value: "rose" },
];

const NEWS_STATUS_OPTIONS = [
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
];

const NEWS_LANGUAGE_OPTIONS = [
  { label: "Ukrainian", value: "uk" },
  { label: "English", value: "en" },
];

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  summary: "",
  body_html: "<p>Write the update here.</p>",
  cover_image_url: "",
  locale: "uk",
  tone: "cobalt",
  status: "draft",
  pinned: false,
};

export const NewsPage: React.FC = () => {
  const { message } = App.useApp();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [form] = Form.useForm();

  const getToken = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session?.access_token ?? null;
  };

  const fetchList = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/news`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.status === "success") setList(json.data || []);
      else message.error(json.message || "Failed to load news");
    } catch (error) {
      console.error(error);
      message.error("Failed to load news");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openCreate = () => {
    setEditingItem(null);
    form.setFieldsValue(EMPTY_FORM);
    setDrawerOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    form.setFieldsValue({
      ...EMPTY_FORM,
      ...item,
      cover_image_url: item.cover_image_url || "",
    });
    setDrawerOpen(true);
  };

  const submit = async (values: any) => {
    const token = await getToken();
    if (!token) return;
    setSaving(true);
    try {
      const url = editingItem ? `${API_BASE_URL}/admin/news/${editingItem.id}` : `${API_BASE_URL}/admin/news`;
      const method = editingItem ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (json.status === "success") {
        message.success(editingItem ? "News updated" : "News published");
        setDrawerOpen(false);
        setEditingItem(null);
        form.resetFields();
        fetchList();
      } else {
        message.error(json.message || json.error || "Failed to save news");
      }
    } catch (error) {
      console.error(error);
      message.error("Failed to save news");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/news/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.status === "success") {
        message.success("News deleted");
        setDeleteTarget(null);
        fetchList();
      } else {
        message.error(json.message || json.error || "Failed to delete news");
      }
    } catch (error) {
      console.error(error);
      message.error("Failed to delete news");
    }
  };

  const stats = useMemo(() => {
    const published = list.filter((item) => item.status === "published").length;
    const pinned = list.filter((item) => item.pinned).length;
    const totalViews = list.reduce((sum, item) => sum + Number(item.view_count || 0), 0);
    return { published, pinned, totalViews };
  }, [list]);

  return (
    <>
      <Card
        title="Product News"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New update
          </Button>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 20 }}>
          <MiniStat title="Published" value={stats.published} />
          <MiniStat title="Pinned" value={stats.pinned} />
          <MiniStat title="Views" value={stats.totalViews} />
        </div>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={list}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: "Title",
              dataIndex: "title",
              key: "title",
              render: (_: any, record: any) => (
                <div>
                  <div style={{ fontWeight: 700, color: "rgba(0,0,0,0.88)" }}>{record.title}</div>
                  {record.subtitle ? <Text type="secondary">{record.subtitle}</Text> : null}
                </div>
              ),
            },
            {
              title: "Status",
              dataIndex: "status",
              width: 120,
              render: (value: string) => (
                <Tag color={value === "published" ? "green" : "gold"}>{value}</Tag>
              ),
            },
            {
              title: "Language",
              dataIndex: "locale",
              width: 120,
              render: (value: string) => (
                <Tag color={value === "en" ? "geekblue" : "cyan"}>{value === "en" ? "English" : "Ukrainian"}</Tag>
              ),
            },
            {
              title: "Pinned",
              dataIndex: "pinned",
              width: 100,
              render: (value: boolean) => value ? <Tag icon={<PushpinOutlined />} color="blue">Pinned</Tag> : "—",
            },
            {
              title: "Views",
              dataIndex: "view_count",
              width: 100,
              render: (value: number) => (
                <Space size={6}>
                  <EyeOutlined />
                  <span>{value || 0}</span>
                </Space>
              ),
            },
            {
              title: "Published",
              dataIndex: "published_at",
              width: 180,
              render: (value: string | null) => value ? new Date(value).toLocaleString() : "—",
            },
            {
              title: "Actions",
              key: "actions",
              width: 150,
              render: (_: any, record: any) => (
                <Space>
                  <Button icon={<EditOutlined />} onClick={() => openEdit(record)} />
                  <Button danger icon={<DeleteOutlined />} onClick={() => setDeleteTarget(record)} />
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title={editingItem ? "Edit news update" : "Create news update"}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingItem(null);
        }}
        width={680}
        destroyOnClose
        extra={
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {editingItem ? "Save changes" : "Create update"}
          </Button>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={EMPTY_FORM}
          onFinish={submit}
        >
          <Form.Item label="Title" name="title" rules={[{ required: true, message: "Title is required" }]}>
            <Input placeholder="What changed?" />
          </Form.Item>

          <Form.Item label="Subtitle" name="subtitle">
            <Input placeholder="Short secondary line shown in the modal detail view" />
          </Form.Item>

          <Form.Item label="Summary" name="summary" rules={[{ required: true, message: "Summary is required" }]}>
            <Input.TextArea rows={3} placeholder="One-paragraph summary shown in the news list." />
          </Form.Item>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
            <Form.Item label="Language" name="locale" rules={[{ required: true, message: "Language is required" }]}>
              <Select options={NEWS_LANGUAGE_OPTIONS} />
            </Form.Item>
            <Form.Item label="Tone" name="tone">
              <Select options={NEWS_TONE_OPTIONS} />
            </Form.Item>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
            <Form.Item label="Status" name="status">
              <Select options={NEWS_STATUS_OPTIONS} />
            </Form.Item>
            <Form.Item label="Pinned at top" name="pinned" valuePropName="checked">
              <Switch checkedChildren="Pinned" unCheckedChildren="Standard" />
            </Form.Item>
          </div>

          <Form.Item label="Cover image URL" name="cover_image_url">
            <Input placeholder="https://..." />
          </Form.Item>

          <Form.Item label="Body HTML" name="body_html" rules={[{ required: true, message: "Body HTML is required" }]}>
            <Input.TextArea rows={16} placeholder="<p>Share the details of the update here.</p>" />
          </Form.Item>

          {editingItem ? (
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              View count updates automatically as users open this news item in the in-app support modal.
            </Paragraph>
          ) : null}
        </Form>
      </Drawer>

      <Modal
        open={!!deleteTarget}
        title="Delete news update?"
        okText="Delete"
        okButtonProps={{ danger: true }}
        onOk={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      >
        <p>This will permanently remove this update and its view history.</p>
      </Modal>
    </>
  );
};

const MiniStat: React.FC<{ title: string; value: number }> = ({ title, value }) => (
  <div
    style={{
      border: "1px solid #e5e7eb",
      borderRadius: 14,
      padding: 16,
      background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.96))",
      boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
    }}
  >
    <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
    <div style={{ marginTop: 6, fontSize: 28, fontWeight: 700, color: "rgba(0,0,0,0.88)" }}>{value}</div>
  </div>
);
