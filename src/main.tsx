import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";
import "./theme-gothic.css";
import "./theme-bright.css";
import "./theme-dark.css";
import "./mobile.css";
import "./cafe-table.css";
import "./concept-ui.css";
import "./shuffle-ritual.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
