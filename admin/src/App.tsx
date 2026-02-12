import { Authenticated, Refine } from "@refinedev/core";
import { DevtoolsPanel, DevtoolsProvider } from "@refinedev/devtools";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import {
  AuthPage,
  ErrorComponent,
  ThemedLayout,
  useNotificationProvider,
} from "@refinedev/antd";
import "@refinedev/antd/dist/reset.css";
import { DashboardOutlined, UserOutlined, GlobalOutlined, CreditCardOutlined } from "@ant-design/icons";

import routerProvider, {
  CatchAllNavigate,
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { liveProvider } from "@refinedev/supabase";
import { App as AntdApp, ConfigProvider, theme } from "antd";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom"; // Використовуємо react-router-dom
import { ColorModeContextProvider } from "./contexts/color-mode";
import authProvider from "./providers/auth";
import { dataProvider } from "./providers/data";
import { supabaseClient } from "./providers/supabase-client";

// Імпорт нашої сторінки (переконайся, що файл існує за цим шляхом)
import { JourneyList } from "./pages/journeys/list";
import { DashboardPage } from "./pages/dashboard";
import { UserList } from "./pages/users/list";
import { PlanList } from "./pages/plans/list";
import { PlanCreate } from "./pages/plans/create";
import { PlanEdit } from "./pages/plans/edit";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ColorModeContextProvider>
          <AntdApp>
            <ConfigProvider
              theme={{
                algorithm: theme.darkAlgorithm,
                token: {
                  colorPrimary: "#3E7BFA", // Electric Blue
                  colorBgBase: "#0F1014", // Deep dark background
                  colorBgContainer: "#16181D", // Slightly lighter for cards
                  colorBorder: "rgba(255, 255, 255, 0.08)", // Subtle borders
                  borderRadius: 8,
                  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  fontSize: 15,
                  colorTextSecondary: "rgba(255, 255, 255, 0.45)",
                },
                components: {
                  Card: {
                    colorBgContainer: "#16181D",
                    colorBorderSecondary: "rgba(255, 255, 255, 0.08)",
                    boxShadowTertiary: "none", // Remove heavy shadows
                  },
                  Layout: {
                    bodyBg: "#0F1014",
                    headerBg: "#0F1014",
                    siderBg: "#16181D",
                  },
                  Table: {
                    colorBgContainer: "#16181D",
                    headerBg: "transparent",
                    borderColor: "rgba(255, 255, 255, 0.08)",
                  }
                }
              }}
            >
            <DevtoolsProvider>
              <Refine
                dataProvider={dataProvider}
                liveProvider={liveProvider(supabaseClient)}
                authProvider={authProvider}
                routerProvider={routerProvider}
                notificationProvider={useNotificationProvider}
                options={{
                  syncWithLocation: true,
                  warnWhenUnsavedChanges: true,
                  projectId: "Ec91Ix-DwFSGV-M4UMOR",
                }}
                // 1. ОПИСУЄМО РЕСУРСИ (Меню зліва)
                resources={[
                  {
                    name: "dashboard",
                    list: "/dashboard",
                    meta: {
                      label: "Dashboard",
                      icon: <DashboardOutlined />,
                    },
                  },
                  {
                    name: "admin_dashboard_stats",
                    meta: { hide: true } // Приховано з меню, але доступно для API
                  },
                  {
                    name: "admin_chart_data",
                    meta: { hide: true }
                  },
                  {
                    name: "admin_users_stats",
                    list: "/users",
                    meta: {
                      label: "Users 360",
                      icon: <UserOutlined />,
                    },
                  },
                  {
                    name: "journeys",
                    list: "/journeys",
                    meta: {
                      label: "Journeys",
                      icon: <GlobalOutlined />,
                    },
                  },
                  {
                    name: "plans",
                    list: "/plans",
                    create: "/plans/create",
                    edit: "/plans/edit/:id",
                    meta: {
                      label: "Billing Plans",
                      icon: <CreditCardOutlined />,
                    },
                  },
                ]}
              >
                <Routes>
                  {/* 2. СТОРІНКА ЛОГІНУ (Публічна) */}
                  <Route
                    path="/login"
                    element={
                      <AuthPage
                        type="login"
                        title={
                          <div
                            style={{
                              fontSize: "24px",
                              fontWeight: "bold",
                              textAlign: "center",
                            }}
                          >
                            IteroJM Admin
                          </div>
                        }
                      />
                    }
                  />

                  {/* 3. ЗАХИЩЕНА ЗОНА (Тільки для адміна) */}
                  <Route
                    element={
                      <Authenticated
                        key="authenticated-inner"
                        fallback={<CatchAllNavigate to="/login" />}
                      >
                        <ThemedLayout>
                          <Outlet />
                        </ThemedLayout>
                      </Authenticated>
                    }
                  >
                    {/* Головна перекидає на список мап */}
                    <Route
                      index
                      element={<NavigateToResource resource="dashboard" />}
                    />
                    
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/users" element={<UserList />} />
                    {/* Список мап */}
                    <Route path="/journeys" element={<JourneyList />} />

                    {/* Плани */}
                    <Route path="/plans" element={<PlanList />} />
                    <Route path="/plans/create" element={<PlanCreate />} />
                    <Route path="/plans/edit/:id" element={<PlanEdit />} />
                    
                    {/* Сторінка помилки 404 */}
                    <Route path="*" element={<ErrorComponent />} />
                  </Route>
                </Routes>

                <RefineKbar />
                <UnsavedChangesNotifier />
                <DocumentTitleHandler />
              </Refine>
              <DevtoolsPanel />
            </DevtoolsProvider>
            </ConfigProvider>
          </AntdApp>
        </ColorModeContextProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;