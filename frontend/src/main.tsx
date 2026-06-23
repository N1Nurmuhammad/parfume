import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { DatesProvider } from "@mantine/dates";

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/charts/styles.css";
import "./index.css";

import { theme } from "./theme";
import { LangProvider } from "./i18n";
import { AuthProvider } from "./auth/AuthContext";
import { App } from "./App";

const stored = localStorage.getItem("parfume_theme");
const defaultScheme = stored === "dark" ? "dark" : "light";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme={defaultScheme}>
      <DatesProvider settings={{ firstDayOfWeek: 1 }}>
        <Notifications position="top-right" />
        <LangProvider>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </LangProvider>
      </DatesProvider>
    </MantineProvider>
  </React.StrictMode>,
);
