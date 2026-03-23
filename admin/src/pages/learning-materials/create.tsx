import React from "react";
import { Create, useForm } from "@refinedev/antd";
import { Form } from "antd";
import { LEARNING_MATERIAL_INITIAL_VALUES, LearningMaterialFields } from "./shared";

export const LearningMaterialCreate: React.FC = () => {
  const { formProps, saveButtonProps, form } = useForm({
    resource: "learning_materials",
  });

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} form={form} layout="vertical" initialValues={{ ...LEARNING_MATERIAL_INITIAL_VALUES, ...formProps.initialValues }}>
        <LearningMaterialFields form={form} />
      </Form>
    </Create>
  );
};
