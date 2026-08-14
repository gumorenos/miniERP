import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { api, clearToken, getToken } from "./api";
import { GlobalActionError } from "./global-action-error";
import { WorkshopApp } from "./workshop-app";

async function start() {
  if (!getToken()) return window.location.replace("/login.html");
  try {
    const session = await api.session();
    if (session.mustChangePassword) return window.location.replace("/change-password.html");
  } catch {
    clearToken();
    return window.location.replace("/login.html");
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><GlobalActionError /><WorkshopApp /></React.StrictMode>);
}

void start();
