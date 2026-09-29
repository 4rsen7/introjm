import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, App, Button, Card, DatePicker, Empty, Form, Grid, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Typography } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { API_BASE_URL } from "../../providers/constants";
import { supabaseClient } from "../../providers/supabase-client";
import "./research.css";

type Grant = {
  user_id: string; expires_at: string; max_studies: number; max_interviews: number; max_analyses: number;
  max_storage_bytes: number; max_transcription_seconds: number; max_members: number;
  workspace_count: number; studies_used: number; interviews_used: number; analyses_used: number;
  storage_bytes_used: number; transcription_seconds_used: number; members_used: number;
};
type Job = { id: string; kind: string; status: string; attempts: number; error_code?: string | null;
  workspace_id: string; study_id: string; interview_id?: string | null; created_at: string; updated_at: string };
type Worker = { id: string; last_seen: string; capabilities: string[] };
type Queue = { kind: string; queued: number; running: number; expired_leases: number; failed_last_day: number; oldest_wait_seconds: number };
type Health = { limits: { global_slots: number; workspace_slots: number; media_slots: number; max_pending: number; max_workspace_pending: number } | null;
  workers: Worker[]; queue: Queue[] };
type GrantForm = { user_id: string; expires_at: Dayjs; max_studies: number; max_interviews: number; max_analyses: number;
  storage_mb: number; transcription_minutes: number; max_members: number };
type Section = "grants" | "jobs" | "health";

const MB = 1048576;
const statuses = ["queued", "running", "completed", "stale", "failed", "canceled"];
const kindLabels: Record<string, string> = {
  interview_summary: "Interview summary", study_synthesis: "Study synthesis",
  media_transcription: "Recording transcription", transcript_impact: "Transcript impact",
  interview_evidence: "Interview evidence",
};
const kindLabel = (kind: string) => kindLabels[kind] || kind.replace(/_/g, " ");
const errorText = (error: unknown) => error instanceof Error ? error.message : "Request failed";
const shortId = (id: string) => `${id.slice(0, 8)}…`;
const when = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "—";
const amount = (value: number) => Number(value || 0).toLocaleString();
const usage = (used: number, limit: number) => `${amount(used)} / ${amount(limit)}`;
const unitUsage = (used: number, limit: number, factor: number, unit: string) =>
  `${(used / factor).toLocaleString(undefined, { maximumFractionDigits: 1 })} / ${(limit / factor).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to continue");
  const response = await fetch(`${API_BASE_URL}/admin/research${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${session.access_token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.status !== "success") throw new Error(payload?.message || `Research request failed (${response.status})`);
  return payload.data as T;
}

const countFields: Array<{ name: "max_studies" | "max_interviews" | "max_analyses" | "max_members"; label: string; max: number }> = [
  { name: "max_studies", label: "Studies", max: 10000 },
  { name: "max_interviews", label: "Interviews", max: 100000 },
  { name: "max_analyses", label: "AI analyses", max: 100000 },
  { name: "max_members", label: "Team members", max: 1000 },
];

export const ResearchAdminPage: React.FC = () => {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const [form] = Form.useForm<GrantForm>();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Section, string>>>({});
  const [saving, setSaving] = useState(false);
  const [actingJob, setActingJob] = useState<string | null>(null);
  const [revokingUser, setRevokingUser] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingGrant, setEditingGrant] = useState<Grant | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    const results = await Promise.allSettled([
      api<Grant[]>("/grants?limit=100"),
      api<Job[]>(`/jobs?limit=100${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ""}`),
      api<Health>("/health"),
    ]);
    if (sequence !== loadSequence.current) return;
    const nextErrors: Partial<Record<Section, string>> = {};
    const sections: Section[] = ["grants", "jobs", "health"];
    results.forEach((result, index) => {
      if (result.status === "rejected") nextErrors[sections[index]] = errorText(result.reason);
    });
    if (results[0].status === "fulfilled") setGrants(results[0].value);
    if (results[1].status === "fulfilled") setJobs(results[1].value);
    if (results[2].status === "fulfilled") setHealth(results[2].value);
    setErrors(nextErrors);
    setLoading(false);
  }, [statusFilter]);
  useEffect(() => { void load(); return () => { loadSequence.current += 1; }; }, [load]);

  const openEditor = (grant?: Grant) => {
    setEditingGrant(grant || null);
    form.resetFields();
    form.setFieldsValue(grant ? {
      user_id: grant.user_id, expires_at: dayjs(grant.expires_at),
      max_studies: grant.max_studies, max_interviews: grant.max_interviews, max_analyses: grant.max_analyses,
      storage_mb: grant.max_storage_bytes / MB, transcription_minutes: grant.max_transcription_seconds / 60,
      max_members: grant.max_members,
    } : {
      user_id: "", expires_at: dayjs().add(30, "day"), max_studies: 20,
      max_interviews: 100, max_analyses: 20, storage_mb: 1024,
      transcription_minutes: 60, max_members: 10,
    });
    setEditorOpen(true);
  };
  const saveGrant = async (values: GrantForm) => {
    setSaving(true);
    try {
      const max_storage_bytes = editingGrant && values.storage_mb === editingGrant.max_storage_bytes / MB
        ? editingGrant.max_storage_bytes : Math.round(values.storage_mb * MB);
      const max_transcription_seconds = editingGrant && values.transcription_minutes === editingGrant.max_transcription_seconds / 60
        ? editingGrant.max_transcription_seconds : Math.round(values.transcription_minutes * 60);
      await api(`/grants/${values.user_id}`, { method: "PUT", body: JSON.stringify({
        expires_at: values.expires_at.toISOString(), max_studies: values.max_studies,
        max_interviews: values.max_interviews, max_analyses: values.max_analyses,
        max_storage_bytes, max_transcription_seconds, max_members: values.max_members,
      }) });
      message.success("Research access saved");
      setEditorOpen(false);
      await load();
    } catch (error) { message.error(errorText(error)); }
    finally { setSaving(false); }
  };
  const revoke = async (userId: string) => {
    setRevokingUser(userId);
    try { await api(`/grants/${userId}`, { method: "DELETE" }); message.success("Research access revoked"); await load(); }
    catch (error) { message.error(errorText(error)); }
    finally { setRevokingUser(null); }
  };
  const act = async (job: Job, action: "retry" | "cancel") => {
    setActingJob(job.id);
    try { await api(`/jobs/${job.id}/${action}`, { method: "POST" }); message.success(action === "retry" ? "Job queued for retry" : "Job canceled"); await load(); }
    catch (error) { message.error(errorText(error)); }
    finally { setActingJob(null); }
  };

  const sectionError = (section: Section) => errors[section] && <Alert type="error" showIcon className="research-admin-error"
    message={`Could not load ${section === "health" ? "worker health" : section}`}
    description={`${errors[section]}. Any data below may be outdated.`}
    action={<Button size="small" onClick={() => void load()}>Try again</Button>} />;
  const noData = (description: string) => <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />;
  const workerState = (worker: Worker) => {
    const age = Date.now() - Date.parse(worker.last_seen);
    return Number.isFinite(age) && age >= 0 && age <= 90000 ? <Tag color="success">Active</Tag> : <Tag color="warning">Heartbeat overdue</Tag>;
  };

  return <div className="research-admin">
    <div className="research-admin-header">
      <div><Typography.Title level={3} style={{ margin: 0 }}>Research operations</Typography.Title>
        <Typography.Text type="secondary">Manage Research access, usage, processing jobs, and worker health.</Typography.Text></div>
      <Button onClick={() => void load()} loading={loading}>Refresh data</Button>
    </div>
    <Tabs items={[
      { key: "grants", label: "Access & usage", children: <Card className="research-admin-card"
        title="Research access" extra={<Button type="primary" onClick={() => openEditor()}>Grant access</Button>}>
        {sectionError("grants")}
        <Typography.Paragraph type="secondary">Limits are per user. Usage is shown against each user's current allowance.</Typography.Paragraph>
        <Table<Grant> rowKey="user_id" loading={loading && !grants.length} dataSource={grants} scroll={{ x: 1430 }} pagination={{ pageSize: 20 }}
          locale={{ emptyText: noData(errors.grants ? "Access grants could not be loaded" : "No Research access grants found") }}
          columns={[
            { title: "User", width: 150, dataIndex: "user_id", render: (id: string) => <Typography.Text copyable={{ text: id }} title={id}>{shortId(id)}</Typography.Text> },
            { title: "Access expires", width: 200, dataIndex: "expires_at", render: (value: string) => <Tag color={new Date(value) > new Date() ? "success" : "error"}>{when(value)}</Tag> },
            { title: "Workspaces", width: 120, dataIndex: "workspace_count" },
            { title: "Studies", width: 110, render: (_, row) => usage(row.studies_used, row.max_studies) },
            { title: "Interviews", width: 110, render: (_, row) => usage(row.interviews_used, row.max_interviews) },
            { title: "AI analyses", width: 120, render: (_, row) => usage(row.analyses_used, row.max_analyses) },
            { title: "Storage", width: 150, render: (_, row) => unitUsage(row.storage_bytes_used, row.max_storage_bytes, MB, "MB") },
            { title: "Transcription", width: 150, render: (_, row) => unitUsage(row.transcription_seconds_used, row.max_transcription_seconds, 60, "min") },
            { title: "Team members", width: 140, render: (_, row) => usage(row.members_used, row.max_members) },
            { title: "Actions", key: "actions", width: 180, fixed: screens.md ? "right" : undefined, render: (_, row) => <Space wrap>
              <Button onClick={() => openEditor(row)}>Edit limits</Button>
              <Popconfirm title="Revoke Research access?" description="This user will lose access immediately." okText="Revoke" okButtonProps={{ danger: true }} onConfirm={() => void revoke(row.user_id)}>
                <Button danger loading={revokingUser === row.user_id}>Revoke</Button>
              </Popconfirm>
            </Space> },
          ]} />
      </Card> },
      { key: "jobs", label: "Jobs", children: <Card className="research-admin-card"
        title="Processing jobs" extra={<Select aria-label="Filter jobs by status" allowClear placeholder="All statuses" value={statusFilter}
          onChange={value => { setJobs([]); setStatusFilter(value); }}
          className="research-admin-filter" options={statuses.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} />}>
        {sectionError("jobs")}
        <Typography.Paragraph type="secondary">The newest 100 jobs are shown. Use the status filter to narrow the list.</Typography.Paragraph>
        <Table<Job> rowKey="id" loading={loading && !jobs.length} dataSource={jobs} scroll={{ x: 1150 }} pagination={{ pageSize: 20 }}
          locale={{ emptyText: noData(errors.jobs ? "Jobs could not be loaded" : statusFilter ? `No ${statusFilter} jobs found` : "No processing jobs found") }}
          columns={[
            { title: "Job", width: 150, dataIndex: "id", render: (id: string) => <Typography.Text copyable={{ text: id }} title={id}>{shortId(id)}</Typography.Text> },
            { title: "Type", width: 180, dataIndex: "kind", render: kindLabel },
            { title: "Status", width: 130, dataIndex: "status", render: (status: string) => <Tag color={status === "completed" ? "success" : status === "failed" ? "error" : status === "running" ? "processing" : status === "stale" ? "warning" : "default"}>{status}</Tag> },
            { title: "Attempts", width: 100, dataIndex: "attempts" },
            { title: "Error code", width: 220, dataIndex: "error_code", render: (code?: string) => code ? <Typography.Text type="danger" copyable={{ text: code }}>{code}</Typography.Text> : "—" },
            { title: "Created", width: 190, dataIndex: "created_at", render: when },
            { title: "Actions", key: "actions", width: 180, fixed: screens.md ? "right" : undefined, render: (_, row) => <Space wrap>
              <Button disabled={row.status !== "failed"} loading={actingJob === row.id} onClick={() => void act(row, "retry")}>Retry</Button>
              <Popconfirm title="Cancel this job?" description="Work in progress will be stopped." okText="Cancel job" okButtonProps={{ danger: true }} onConfirm={() => void act(row, "cancel")}>
                <Button danger loading={actingJob === row.id} disabled={!statuses.slice(0, 2).includes(row.status)}>Cancel</Button>
              </Popconfirm>
            </Space> },
          ]} />
      </Card> },
      { key: "workers", label: "Workers", children: <div className="research-admin-stack">
        {sectionError("health")}
        <Card className="research-admin-card" title="Processing capacity">
          {health?.limits ? <div className="research-admin-stats">
            <div><strong>{amount(health.limits.global_slots)}</strong><span>Global slots</span></div>
            <div><strong>{amount(health.limits.workspace_slots)}</strong><span>Slots per workspace</span></div>
            <div><strong>{amount(health.limits.media_slots)}</strong><span>Media slots</span></div>
            <div><strong>{amount(health.limits.max_pending)}</strong><span>Max pending jobs</span></div>
            <div><strong>{amount(health.limits.max_workspace_pending)}</strong><span>Pending per workspace</span></div>
          </div> : !loading && noData(errors.health ? "Capacity could not be loaded" : "Capacity information is unavailable")}
        </Card>
        <Card className="research-admin-card" title="Workers" extra={<Typography.Text type="secondary">Heartbeat every 30 seconds</Typography.Text>}>
          <Table<Worker> rowKey="id" loading={loading && !health} dataSource={health?.workers || []} pagination={false} scroll={{ x: 600 }}
            locale={{ emptyText: noData(errors.health ? "Workers could not be loaded" : "No worker heartbeats reported") }} columns={[
              { title: "Worker", width: 150, dataIndex: "id", render: (id: string) => <Typography.Text copyable={{ text: id }} title={id}>{shortId(id)}</Typography.Text> },
              { title: "Heartbeat", width: 190, key: "heartbeat", render: (_, row) => workerState(row) },
              { title: "Last seen", width: 190, dataIndex: "last_seen", render: when },
              { title: "Capabilities", dataIndex: "capabilities", render: (capabilities: string[]) => capabilities?.length ? capabilities.map(kindLabel).join(", ") : "—" },
            ]} />
          <Typography.Text type="secondary">A heartbeat is overdue after 90 seconds. Refresh to check the latest state.</Typography.Text>
        </Card>
        <Card className="research-admin-card" title="Queue by job type">
          <Table<Queue> rowKey="kind" loading={loading && !health} dataSource={health?.queue || []} pagination={false} scroll={{ x: 700 }}
            locale={{ emptyText: noData(errors.health ? "Queue health could not be loaded" : "No jobs in the queue") }} columns={[
              { title: "Type", width: 180, dataIndex: "kind", render: kindLabel },
              { title: "Queued", dataIndex: "queued", render: amount },
              { title: "Running", dataIndex: "running", render: amount },
              { title: "Expired leases", dataIndex: "expired_leases", render: (value: number) => Number(value) > 0 ? <Tag color="warning">{amount(value)}</Tag> : "0" },
              { title: "Failed (24h)", dataIndex: "failed_last_day", render: (value: number) => Number(value) > 0 ? <Tag color="error">{amount(value)}</Tag> : "0" },
              { title: "Oldest wait", dataIndex: "oldest_wait_seconds", render: (seconds: number) => `${Math.round(seconds / 60)} min` },
            ]} />
        </Card>
      </div> },
    ]} />
    <Modal title={editingGrant ? "Edit Research access" : "Grant Research access"} open={editorOpen} onCancel={() => setEditorOpen(false)}
      onOk={() => void form.submit()} okText="Save access" confirmLoading={saving} destroyOnClose width={680}>
      <Form form={form} layout="vertical" onFinish={saveGrant} className="research-admin-form">
        <Form.Item name="user_id" label="User ID" rules={[{ required: true, pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, message: "Enter a valid user UUID" }]}>
          <Input disabled={Boolean(editingGrant)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" />
        </Form.Item>
        <Form.Item name="expires_at" label="Access expires" extra="Choose a date and time within the next five years, in your local timezone."
          rules={[{ required: true, message: "Choose an expiry date" }, { validator: async (_, value: Dayjs) => {
            if (value && (!value.isValid() || value.valueOf() <= Date.now())) throw new Error("Choose a future date and time");
            if (value && value.isAfter(dayjs().add(5, "year"))) throw new Error("Choose a date within the next five years");
          } }]}>
          <DatePicker showTime format="YYYY-MM-DD HH:mm" className="research-admin-date"
            disabledDate={date => date.isBefore(dayjs(), "day") || date.isAfter(dayjs().add(5, "year"), "day")} />
        </Form.Item>
        <div className="research-admin-form-grid">
          {countFields.map(field => <Form.Item key={field.name} name={field.name} label={field.label}
            rules={[{ required: true, type: "number", min: 1, max: field.max, message: `Enter a whole number from 1 to ${amount(field.max)}` },
              { validator: async (_, value: number) => { if (value != null && !Number.isInteger(value)) throw new Error("Enter a whole number"); } }]}>
            <InputNumber className="research-admin-number" min={1} max={field.max} precision={0} />
          </Form.Item>)}
          <Form.Item name="storage_mb" label="Storage (MB)" extra="1 MB = 1,048,576 bytes" rules={[{ required: true, type: "number", min: 1 / MB, max: 1048576, message: "Enter a positive amount up to 1,048,576 MB" }]}>
            <InputNumber className="research-admin-number" min={1 / MB} max={1048576} step={100} />
          </Form.Item>
          <Form.Item name="transcription_minutes" label="Transcription (min)" extra="One minute is 60 seconds" rules={[{ required: true, type: "number", min: 1 / 60, max: 100000000 / 60, message: "Enter a positive amount within the limit" }]}>
            <InputNumber className="research-admin-number" min={1 / 60} max={100000000 / 60} step={10} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  </div>;
};
