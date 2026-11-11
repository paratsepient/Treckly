import "@index/ui-patterns/styles.css";
import "./check.css";
import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(createElement(StrictMode, null, createElement(App)));
}
