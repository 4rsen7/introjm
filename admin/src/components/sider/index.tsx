import React from "react";
import { ThemedSider } from "@refinedev/antd";
import type { RefineThemedLayoutSiderProps } from "@refinedev/antd";

/**
 * Sider без кнопки Logout — вихід тільки в хедері (профіль).
 */
export const Sider: React.FC<RefineThemedLayoutSiderProps> = (props) => (
  <ThemedSider {...props} render={({ items }) => items} />
);
