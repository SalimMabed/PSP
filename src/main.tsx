import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
// Polices auto-hébergées (variantes variables) : pas de dépendance à un CDN, fonctionne hors ligne.
import "@fontsource-variable/literata";
import "@fontsource-variable/schibsted-grotesk";
import { App } from "./App";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
