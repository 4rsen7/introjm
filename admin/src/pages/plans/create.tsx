import React from "react";
import { Create, useForm } from "@refinedev/antd";
import { Form, Input, InputNumber, Checkbox, Select } from "antd";

export const PlanCreate: React.FC = () => {
  const { formProps, saveButtonProps } = useForm();

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Plan Name" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea />
        </Form.Item>
        <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="Monthly Price" name="price_monthly" rules={[{ required: true }]}>
            <InputNumber prefix="$" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Yearly Price" name="price_yearly" rules={[{ required: true }]}>
            <InputNumber prefix="$" style={{ width: '100%' }} />
            </Form.Item>
        </div>
        <Form.Item label="Features (Comma separated)" name="features" help="Example: Unlimited Maps, Priority Support">
           {/* Simple text input for array handling, Refine/Supabase might need transformation if strict array */}
           <Select mode="tags" tokenSeparators={[',']} placeholder="Type feature and press enter" />
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
