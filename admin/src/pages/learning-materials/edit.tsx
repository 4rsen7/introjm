import React from "react";
import { Edit, useForm } from "@refinedev/antd";
import { Form } from "antd";
import { LEARNING_MATERIAL_INITIAL_VALUES, LearningMaterialFields } from "./shared";

export const LearningMaterialEdit: React.FC = () => {
  const { formProps, saveButtonProps, form } = useForm({
    resource: "learning_materials",
  });

  return (
    <Edit saveButtonProps={saveButtonProps}>
      <Form {...formProps} form={form} layout="vertical" initialValues={{ ...LEARNING_MATERIAL_INITIAL_VALUES, ...formProps.initialValues }}>
        <LearningMaterialFields form={form} />
      </Form>
    </Edit>
  );
};
