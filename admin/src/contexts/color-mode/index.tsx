import { RefineThemes } from "@refinedev/antd";
import { ConfigProvider, theme } from "antd";
import {
  type PropsWithChildren,
  createContext,
  useEffect,
  useState,
} from "react";

type ColorModeContextType = {
  mode: string;
  setMode: (mode?: "light" | "dark") => void;
};

export const ColorModeContext = createContext<ColorModeContextType>(
  {} as ColorModeContextType
);

const darkTokens = {
  colorPrimary: "#3E7BFA",
  colorBgBase: "#0F1014",
  colorBgContainer: "#16181D",
  colorBorder: "rgba(255, 255, 255, 0.08)",
  colorTextSecondary: "rgba(255, 255, 255, 0.45)",
};

/* Відтінки як у клієнта (Tailwind gray-50, gray-200) */
const lightTokens = {
  colorPrimary: "#3E7BFA",
  colorBgBase: "#F9FAFB",
  colorBgContainer: "#ffffff",
  colorBorder: "#e5e7eb",
  colorBorderSecondary: "#e5e7eb",
  colorText: "rgba(0, 0, 0, 0.88)",
  colorTextSecondary: "#6b7280",
};

export const ColorModeContextProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const colorModeFromLocalStorage = localStorage.getItem("colorMode");
  const [mode, setMode] = useState(
    colorModeFromLocalStorage === "dark" || colorModeFromLocalStorage === "light"
      ? colorModeFromLocalStorage
      : "light"
  );

  useEffect(() => {
    window.localStorage.setItem("colorMode", mode);
  }, [mode]);

  const setColorMode = (newMode?: string) => {
    if (newMode === "light" || newMode === "dark") {
      setMode(newMode);
    } else {
      setMode(mode === "light" ? "dark" : "light");
    }
  };

  const { darkAlgorithm, defaultAlgorithm } = theme;
  const isDark = mode === "dark";
  const tokens = isDark ? darkTokens : lightTokens;
  const componentOverrides = isDark
    ? {
        Card: {
          colorBgContainer: "#16181D",
          colorBorderSecondary: "rgba(255, 255, 255, 0.08)",
          boxShadowTertiary: "none",
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
        },
      }
    : {
        Card: {
          colorBgContainer: "#ffffff",
          colorBorderSecondary: "#e5e7eb",
          boxShadowTertiary: "0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.08)",
        },
        Layout: {
          bodyBg: "#F9FAFB",
          headerBg: "#ffffff",
          siderBg: "#ffffff",
        },
        Table: {
          colorBgContainer: "#ffffff",
          headerBg: "#f9fafb",
          borderColor: "#e5e7eb",
        },
      };

  return (
    <ColorModeContext.Provider
      value={{
        setMode: setColorMode,
        mode,
      }}
    >
      <div data-theme={mode}>
      <ConfigProvider
        theme={{
          ...RefineThemes.Blue,
          algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
          token: {
            ...tokens,
            borderRadius: 8,
            fontFamily:
              "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: 15,
          },
          components: componentOverrides,
        }}
      >
        {children}
      </ConfigProvider>
    </div>
    </ColorModeContext.Provider>
  );
};
