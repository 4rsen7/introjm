import React from "react";
import { Create, useForm } from "@refinedev/antd";
import { Form, Input, InputNumber, Checkbox, Select } from "antd";

export const PlanCreate: React.FC = () => {
  const { formProps, saveButtonProps } = useForm();

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical" initialValues={{ ...formProps.initialValues, features_by_locale: { en: [], uk: [] }, description_by_locale: { en: '', uk: '' }, currency: 'USD' }}>
        <Form.Item label="Plan Name" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Description (English)" name={["description_by_locale", "en"]}>
          <Input.TextArea />
        </Form.Item>
        <Form.Item label="Description (Ukrainian)" name={["description_by_locale", "uk"]}>
          <Input.TextArea />
        </Form.Item>
        <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="Monthly Price" name="price_monthly" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} placeholder="Amount" />
            </Form.Item>
            <Form.Item label="Yearly Price" name="price_yearly" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} placeholder="Amount" />
            </Form.Item>
            <Form.Item label="Currency" name="currency" initialValue="USD">
            <Select options={[{ value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' }, { value: 'UAH', label: 'UAH (₴)' }]} style={{ minWidth: 120 }} />
            </Form.Item>
        </div>
        <Form.Item label="Features (English)" name={["features_by_locale", "en"]}>
          <Select mode="tags" tokenSeparators={[","]} placeholder="Type feature and press enter" />
        </Form.Item>
        <Form.Item label="Features (Ukrainian)" name={["features_by_locale", "uk"]}>
          <Select mode="tags" tokenSeparators={[","]} placeholder="Введіть фічу та натисніть Enter" />
        </Form.Item>
        <Form.Item label="Tier Level (1=Low, 3=High)" name="tier">
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
    </Create>
  );
};
