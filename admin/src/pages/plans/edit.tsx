import React, { useEffect } from "react";
import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, InputNumber, Checkbox, Select } from "antd";

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
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item label="Monthly Price" name="price_monthly" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} placeholder="Amount" />
            </Form.Item>
            <Form.Item label="Yearly Price" name="price_yearly" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} placeholder="Amount" />
            </Form.Item>
            <Form.Item label="Currency" name="currency">
            <Select options={[{ value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' }, { value: 'UAH', label: 'UAH (₴)' }]} style={{ minWidth: 120 }} />
            </Form.Item>
        </div>
        <Form.Item label="Features (English)" name={["features_by_locale", "en"]}>
          <Select mode="tags" tokenSeparators={[","]} placeholder="Type feature and press enter" />
        </Form.Item>
        <Form.Item label="Features (Ukrainian)" name={["features_by_locale", "uk"]}>
          <Select mode="tags" tokenSeparators={[","]} placeholder="Введіть фічу та натисніть Enter" />
        </Form.Item>
        <Form.Item label="Tier Level" name="tier">
          <InputNumber />
        </Form.Item>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Form.Item label="Max Members (per workspace)" name="max_members" help="Leave empty for unlimited">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="Unlimited" />
          </Form.Item>
          <Form.Item label="Max Journeys (per workspace)" name="max_journeys" help="Leave empty for unlimited">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="Unlimited" />
          </Form.Item>
          <Form.Item label="Max Personas (per workspace)" name="max_personas" help="Leave empty for unlimited">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="Unlimited" />
          </Form.Item>
          <Form.Item label="Max Metrics (per workspace)" name="max_metrics" help="Leave empty for unlimited">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="Unlimited" />
          </Form.Item>
        </div>
        <Form.Item name="is_active" valuePropName="checked">
          <Checkbox>Active Plan</Checkbox>
        </Form.Item>
      </Form>
    </Edit>
  );
};
