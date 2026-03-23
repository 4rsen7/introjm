import React, { useEffect } from "react";
import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, InputNumber, Checkbox, Button, Space } from "antd";
import { ArrowUpOutlined, ArrowDownOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";

const capacityFieldHelp = "Leave empty for unlimited active items in a workspace";
const quotaFieldHelp = "Leave empty for unlimited usage per billing period";

export const PlanEdit: React.FC = () => {
  const { formProps, saveButtonProps, form, queryResult } = useForm();

  useEffect(() => {
    const data = queryResult?.data as {
      features?: string[];
      features_by_locale?: { en?: string[]; uk?: string[] };
      description?: string;
      description_by_locale?: { en?: string; uk?: string };
    } | undefined;
    if (!data || !form) return;
    const updates: Record<string, unknown> = {};
    const byLocale = data.features_by_locale ?? {};
    if (byLocale.en === undefined && byLocale.uk === undefined && Array.isArray(data.features)) {
      updates.features_by_locale = { en: data.features, uk: [] };
    }
    const byDesc = data.description_by_locale ?? {};
    if ((byDesc.en === undefined || byDesc.en === null) && (byDesc.uk === undefined || byDesc.uk === null) && typeof data.description === 'string') {
      updates.description_by_locale = { en: data.description, uk: byDesc.uk ?? '' };
    }
    if (Object.keys(updates).length) form.setFieldsValue(updates);
  }, [queryResult?.data, form]);

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Plan Name" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Description (English)" name={["description_by_locale", "en"]}>
          <Input.TextArea />
        </Form.Item>
        <Form.Item label="Description (Ukrainian)" name={["description_by_locale", "uk"]}>
          <Input.TextArea />
        </Form.Item>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Form.Item label="Monthly Price" name="price_monthly" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} placeholder="Amount" />
          </Form.Item>
          <Form.Item label="Yearly Price" name="price_yearly" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} placeholder="Amount" />
          </Form.Item>
          <Form.Item label="Currency" name="currency">
            <Input placeholder="USD / EUR / UAH" />
          </Form.Item>
        </div>

        <Form.Item label="Features (English)">
          <Form.List name={["features_by_locale", "en"]}>
            {(fields, { add, remove, move }) => (
              <>
                {fields.map((field, index) => (
                  <Space key={field.key} align="baseline" style={{ marginBottom: 8, display: "flex" }}>
                    <Form.Item
                      {...field}
                      name={field.name}
                      fieldKey={field.fieldKey}
                      noStyle
                    >
                      <Input placeholder="e.g. 10 Journey Maps" style={{ minWidth: 220 }} />
                    </Form.Item>
                    <Button
                      type="text"
                      icon={<ArrowUpOutlined />}
                      onClick={() => index > 0 && move(index, index - 1)}
                      disabled={index === 0}
                    />
                    <Button
                      type="text"
                      icon={<ArrowDownOutlined />}
                      onClick={() => index < fields.length - 1 && move(index, index + 1)}
                      disabled={index === fields.length - 1}
                    />
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(index)}
                    />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add("")}
                  icon={<PlusOutlined />}
                >
                  Add feature
                </Button>
              </>
            )}
          </Form.List>
        </Form.Item>

        <Form.Item label="Features (Ukrainian)">
          <Form.List name={["features_by_locale", "uk"]}>
            {(fields, { add, remove, move }) => (
              <>
                {fields.map((field, index) => (
                  <Space key={field.key} align="baseline" style={{ marginBottom: 8, display: "flex" }}>
                    <Form.Item
                      {...field}
                      name={field.name}
                      fieldKey={field.fieldKey}
                      noStyle
                    >
                      <Input placeholder="напр. 10 Journey Maps" style={{ minWidth: 220 }} />
                    </Form.Item>
                    <Button
                      type="text"
                      icon={<ArrowUpOutlined />}
                      onClick={() => index > 0 && move(index, index - 1)}
                      disabled={index === 0}
                    />
                    <Button
                      type="text"
                      icon={<ArrowDownOutlined />}
                      onClick={() => index < fields.length - 1 && move(index, index + 1)}
                      disabled={index === fields.length - 1}
                    />
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(index)}
                    />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add("")}
                  icon={<PlusOutlined />}
                >
                  Додати фічу
                </Button>
              </>
            )}
          </Form.List>
        </Form.Item>
        <Form.Item label="Tier Level" name="tier">
          <InputNumber />
        </Form.Item>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#6b7280", marginBottom: 12 }}>
          Workspace Capacity
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Form.Item label="Max Members (active in workspace)" name="max_members" help={capacityFieldHelp}>
            <InputNumber min={0} style={{ width: "100%" }} placeholder="Unlimited" />
          </Form.Item>
          <Form.Item label="Max Journeys (active in workspace)" name="max_journeys" help={capacityFieldHelp}>
            <InputNumber min={0} style={{ width: "100%" }} placeholder="Unlimited" />
          </Form.Item>
          <Form.Item label="Max Personas (active in workspace)" name="max_personas" help={capacityFieldHelp}>
            <InputNumber min={0} style={{ width: "100%" }} placeholder="Unlimited" />
          </Form.Item>
          <Form.Item label="Max Metrics (active in workspace)" name="max_metrics" help={capacityFieldHelp}>
            <InputNumber min={0} style={{ width: "100%" }} placeholder="Unlimited" />
          </Form.Item>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#6b7280", marginBottom: 12, marginTop: 8 }}>
          Billing Period Quotas
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Form.Item label="Interview Creations (per billing period)" name="max_interviews" help={quotaFieldHelp}>
            <InputNumber min={0} style={{ width: "100%" }} placeholder="Unlimited" />
          </Form.Item>
          <Form.Item label="Portrait Generations (per billing period)" name="max_portraits_per_period" help={quotaFieldHelp}>
            <InputNumber min={0} style={{ width: "100%" }} placeholder="Unlimited" />
          </Form.Item>
          <Form.Item label="AI Insight Generations (per billing period)" name="max_ai_summaries_per_period" help={quotaFieldHelp}>
            <InputNumber min={0} style={{ width: "100%" }} placeholder="Unlimited" />
          </Form.Item>
          <Form.Item label="PDF Exports (per billing period)" name="max_exports_per_period" help={quotaFieldHelp}>
            <InputNumber min={0} style={{ width: "100%" }} placeholder="Unlimited" />
          </Form.Item>
        </div>
        <Form.Item name="is_active" valuePropName="checked">
          <Checkbox>Active Plan</Checkbox>
        </Form.Item>
      </Form>
    </Edit>
  );
};
