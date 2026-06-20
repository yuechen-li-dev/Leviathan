import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./components/theme-provider";
import { MachinaHost } from "./machina/MachinaHost";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="light" storageKey="leviathan-ui-theme">
      <MachinaHost />
    </ThemeProvider>
  </React.StrictMode>,
);
