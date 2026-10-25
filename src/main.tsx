import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
// Self-hosted fonts (variable variants): no CDN dependency, works offline.
import "@fontsource-variable/literata";
import "@fontsource-variable/schibsted-grotesk";
import { App } from "./App";
import { routerBasename } from "./utils/links";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename()} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
