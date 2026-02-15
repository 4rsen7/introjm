import type { RefineThemedLayoutHeaderProps } from "@refinedev/antd";
import { useGetIdentity, useLogout } from "@refinedev/core";
import {
  Layout as AntdLayout,
  Avatar,
  Button,
  Dropdown,
  Space,
  Switch,
  theme,
  Typography,
} from "antd";
import { UserOutlined, LogoutOutlined } from "@ant-design/icons";
import React, { useContext } from "react";
import { ColorModeContext } from "../../contexts/color-mode";

const { Text } = Typography;
const { useToken } = theme;

type IUser = {
  id?: string;
  name?: string;
  email?: string;
  avatar?: string;
};

export const Header: React.FC<RefineThemedLayoutHeaderProps> = ({
  sticky = true,
}) => {
  const { token } = useToken();
  const { data: user } = useGetIdentity<IUser>();
  const { mutate: logout } = useLogout();
  const { mode, setMode } = useContext(ColorModeContext);

  const headerStyles: React.CSSProperties = {
    backgroundColor: token.colorBgElevated,
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: "0px 24px",
    height: "64px",
  };

  if (sticky) {
    headerStyles.position = "sticky";
    headerStyles.top = 0;
    headerStyles.zIndex = 1;
  }

  const dropdownContent = (
    <div style={{ minWidth: 220, padding: "12px 16px" }}>
      <div style={{ marginBottom: 12 }}>
        {user?.name && (
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{user.name}</div>
        )}
        {user?.email && (
          <Text type="secondary" style={{ fontSize: 12 }}>{user.email}</Text>
        )}
      </div>
      <Button
        type="text"
        danger
        block
        icon={<LogoutOutlined />}
        onClick={() => logout()}
        style={{ textAlign: "left" }}
      >
        Logout
      </Button>
    </div>
  );

  return (
    <AntdLayout.Header style={headerStyles}>
      <Space size="middle">
        <Switch
          checkedChildren="🌛"
          unCheckedChildren="🔆"
          checked={mode === "dark"}
          onChange={() => setMode(mode === "light" ? "dark" : "light")}
        />
        <Dropdown
          dropdownRender={() => (
            <div
              style={{
                backgroundColor: token.colorBgElevated,
                borderRadius: token.borderRadius,
                boxShadow: token.boxShadowSecondary,
                border: `1px solid ${token.colorBorder}`,
                overflow: "hidden",
              }}
            >
              {dropdownContent}
            </div>
          )}
          trigger={["click"]}
          placement="bottomRight"
        >
          <Space
            style={{ cursor: "pointer", padding: "4px 0" }}
            className="header-profile-trigger"
          >
            <Avatar
              icon={<UserOutlined />}
              src={user?.avatar}
              alt={user?.name}
              style={{ backgroundColor: token.colorPrimary }}
            />
          </Space>
        </Dropdown>
      </Space>
    </AntdLayout.Header>
  );
};
