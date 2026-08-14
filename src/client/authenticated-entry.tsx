import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { api, clearToken, getToken } from "./api";
import { WorkshopApp } from "./workshop-app";

const root = document.getElementById("root");

async function start() {
  if (!getToken()) return window.location.replace("/login.html");
  try {
    const session = await api.session();
    if (session.mustChangePassword) return window.location.replace("/change-password.html");
    if (root) createRoot(root).render(<WorkshopApp />);
  } catch {
    clearToken();
    window.location.replace("/login.html");
  }
}

void start();
