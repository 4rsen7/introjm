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
import "./global.css";
import { DashboardOutlined, UserOutlined, GlobalOutlined, CreditCardOutlined, CustomerServiceOutlined, ReadOutlined, NotificationOutlined, ExperimentOutlined } from "@ant-design/icons";

import routerProvider, {
  CatchAllNavigate,
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { liveProvider } from "@refinedev/supabase";
import { App as AntdApp } from "antd";
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
import { SupportList } from "./pages/support/list";
import { LearningMaterialList } from "./pages/learning-materials/list";
import { LearningMaterialCreate } from "./pages/learning-materials/create";
import { LearningMaterialEdit } from "./pages/learning-materials/edit";
import { NewsPage } from "./pages/news";
import { ResearchAdminPage } from "./pages/research";
import { Header } from "./components/header";
import { Sider } from "./components/sider";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ColorModeContextProvider>
          <AntdApp>
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
                  title: { text: "CRM iteroJM" },
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
                  {
                    name: "news",
                    list: "/news",
                    meta: {
                      label: "News",
                      icon: <NotificationOutlined />,
                    },
                  },
                  {
                    name: "learning_materials",
                    list: "/learning-materials",
                    create: "/learning-materials/create",
                    edit: "/learning-materials/edit/:id",
                    meta: {
                      label: "Learning Materials",
                      icon: <ReadOutlined />,
                    },
                  },
                  {
                    name: "support",
                    list: "/support",
                    meta: {
                      label: "Support",
                      icon: <CustomerServiceOutlined />,
                    },
                  },
                  {
                    name: "research",
                    list: "/research",
                    meta: {
                      label: "Research",
                      icon: <ExperimentOutlined />,
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
                        <ThemedLayout Header={Header} Sider={Sider}>
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
                    <Route path="/support" element={<SupportList />} />
                    <Route path="/research" element={<ResearchAdminPage />} />
                    <Route path="/news" element={<NewsPage />} />
                    <Route path="/learning-materials" element={<LearningMaterialList />} />
                    <Route path="/learning-materials/create" element={<LearningMaterialCreate />} />
                    <Route path="/learning-materials/edit/:id" element={<LearningMaterialEdit />} />

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
          </AntdApp>
        </ColorModeContextProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
