import React, { useState, useEffect, useCallback, useContext } from "react";
import { List, Card, Table, Drawer, Button, Form, Input, Spin, Tag, App, Typography, Space, Divider } from "antd";
import { MessageOutlined, BugOutlined, BulbOutlined, UserOutlined, CustomerServiceOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../providers/supabase-client";
import { ColorModeContext } from "../../contexts/color-mode";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5005/api";
const { Text } = Typography;

export const SupportList: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<any>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { mode } = useContext(ColorModeContext);
  const isDark = mode === "dark";

  const getToken = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session?.access_token ?? null;
  };

  const fetchList = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/feedback`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.status === "success") setList(json.data || []);
      else message.error(json.message || "Failed to load");
    } catch (e) {
      console.error(e);
      message.error("Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openThread = async (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
    setThread(null);
    setLoadingThread(true);
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/admin/feedback/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.status === "success") setThread(json.data);
      else message.error(json.message || "Failed to load");
    } catch (e) {
      console.error(e);
      message.error("Failed to load thread");
    } finally {
      setLoadingThread(false);
    }
  };

  const onReply = async (values: { body: string }) => {
    if (!selectedId) return;
    const token = await getToken();
    if (!token) return;
    setReplySubmitting(true);
    try {
      const res = await fetch(`${API_URL}/admin/feedback/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: values.body }),
      });
      const json = await res.json();
      if (json.status === "success") {
        form.resetFields();
        openThread(selectedId);
        message.success("Reply sent");
      } else {
        message.error(json.message || "Failed to send reply");
      }
    } catch (e) {
      console.error(e);
      message.error("Failed to send reply");
    } finally {
      setReplySubmitting(false);
    }
  };

  const formatDate = (d: string) => (d ? new Date(d).toLocaleString() : "");

  return (
    <List>
      <Card title="Support & Feedback">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={list}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: "Type",
              dataIndex: "type",
              key: "type",
              width: 90,
              render: (t: string) =>
                t === "issue" ? (
                  <Tag icon={<BugOutlined />} color="orange">Issue</Tag>
                ) : (
                  <Tag icon={<BulbOutlined />} color="blue">Idea</Tag>
                ),
            },
            { title: "Subject", dataIndex: "subject", key: "subject", ellipsis: true },
            {
              title: "Status",
              dataIndex: "status",
              key: "status",
              width: 100,
              render: (s: string) => (
                <Tag color={s === "replied" ? "green" : s === "closed" ? "default" : "gold"}>{s}</Tag>
              ),
            },
            { title: "Created", dataIndex: "created_at", key: "created_at", width: 160, render: formatDate },
            {
              title: "Actions",
              key: "actions",
              width: 140,
              align: "left",
              className: "support-actions-column",
              render: (_, record: any) => (
                <div style={{ textAlign: "left" }}>
                  <Button type="link" style={{ paddingLeft: 0 }} onClick={() => openThread(record.id)}>
                    View <MessageOutlined />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title={
          thread ? (
            <Space wrap>
              <span>{thread.subject}</span>
              {thread.type === "issue" ? (
                <Tag icon={<BugOutlined />} color="orange">Issue</Tag>
              ) : (
                <Tag icon={<BulbOutlined />} color="blue">Idea</Tag>
              )}
            </Space>
          ) : "Feedback"
        }
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedId(null); setThread(null); }}
        width={560}
        footer={null}
        styles={{ body: { paddingBottom: 24, display: "flex", flexDirection: "column" } }}
      >
        {loadingThread ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : thread ? (
          <>
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 24 }}>
              {/* Original message — User */}
              <Card
                size="small"
                style={{
                  marginBottom: 16,
                  background: isDark ? "rgba(255,255,255,0.04)" : "#f9fafb",
                  border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e5e7eb",
                }}
                styles={{ body: { padding: "12px 16px" } }}
              >
                <Space align="start" size={12} style={{ width: "100%" }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: isDark ? "rgba(255,255,255,0.08)" : "#e5e7eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <UserOutlined style={{ fontSize: 18, color: isDark ? "rgba(255,255,255,0.65)" : "#6b7280" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Space size={8} style={{ marginBottom: 6 }}>
                      <Text strong style={{ color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.88)" }}>User</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatDate(thread.created_at)}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }} copyable={{ text: thread.user_id }}>
                        ID
                      </Text>
                    </Space>
                    <Typography.Paragraph
                      style={{ marginBottom: 0, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.88)", whiteSpace: "pre-wrap" }}
                    >
                      {thread.body}
                    </Typography.Paragraph>
                    {thread.steps_to_reproduce && (
                      <>
                        <Divider style={{ margin: "10px 0" }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>Steps to reproduce:</Text>
                        <Typography.Paragraph
                          style={{ marginTop: 4, marginBottom: 0, color: isDark ? "rgba(255,255,255,0.65)" : "#6b7280", whiteSpace: "pre-wrap", fontSize: 12 }}
                        >
                          {thread.steps_to_reproduce}
                        </Typography.Paragraph>
                      </>
                    )}
                    {thread.attachment_url && (
                      <div style={{ marginTop: 8 }}>
                        <a href={thread.attachment_url} target="_blank" rel="noopener noreferrer">
                          Attachment
                        </a>
                      </div>
                    )}
                  </div>
                </Space>
              </Card>

              {/* Replies */}
              {(thread.replies || []).length > 0 && (
                <>
                  <Divider plain style={{ fontSize: 12, color: isDark ? "rgba(255,255,255,0.45)" : "#6b7280" }}>
                    Conversation
                  </Divider>
                  {(thread.replies || []).map((r: any) => (
                    <Card
                      key={r.id}
                      size="small"
                      style={{
                        marginBottom: 12,
                        marginLeft: r.author_type === "admin" ? 0 : 24,
                        marginRight: r.author_type === "admin" ? 24 : 0,
                        background: r.author_type === "admin"
                          ? "rgba(62, 123, 250, 0.12)"
                          : isDark ? "rgba(255,255,255,0.04)" : "#f9fafb",
                        border: r.author_type === "admin"
                          ? "1px solid rgba(62, 123, 250, 0.35)"
                          : isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e5e7eb",
                      }}
                      styles={{ body: { padding: "10px 14px" } }}
                    >
                      <Space align="start" size={10} style={{ width: "100%" }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: r.author_type === "admin" ? "rgba(62, 123, 250, 0.25)" : isDark ? "rgba(255,255,255,0.08)" : "#e5e7eb",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {r.author_type === "admin" ? (
                            <CustomerServiceOutlined style={{ fontSize: 16, color: "#3E7BFA" }} />
                          ) : (
                            <UserOutlined style={{ fontSize: 14, color: isDark ? "rgba(255,255,255,0.65)" : "#6b7280" }} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Space size={6} style={{ marginBottom: 4 }}>
                            <Text strong style={{ fontSize: 13, color: r.author_type === "admin" ? "#3E7BFA" : (isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.88)") }}>
                              {r.author_type === "admin" ? "Support" : "User"}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {formatDate(r.created_at)}
                            </Text>
                          </Space>
                          <Typography.Paragraph
                            style={{ marginBottom: 0, color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.88)", whiteSpace: "pre-wrap", fontSize: 13 }}
                          >
                            {r.body}
                          </Typography.Paragraph>
                        </div>
                      </Space>
                    </Card>
                  ))}
                </>
              )}
            </div>

            {/* Reply form */}
            <Divider style={{ margin: "16px 0" }} />
            <Form form={form} layout="vertical" onFinish={onReply}>
              <Form.Item name="body" rules={[{ required: true, message: "Enter your reply" }]}>
                <Input.TextArea
                  rows={3}
                  placeholder="Type your reply to the user..."
                  style={{ resize: "none" }}
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" loading={replySubmitting} icon={<MessageOutlined />}>
                  Send Reply
                </Button>
              </Form.Item>
            </Form>
          </>
        ) : null}
      </Drawer>
    </List>
  );
};
