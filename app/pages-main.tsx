import React from "react";
import { createRoot } from "react-dom/client";
import CursedChestApp from "./CursedChestApp";
import PwaRegister from "./PwaRegister";
import "./globals.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CursedChestApp />
    <PwaRegister />
  </React.StrictMode>,
);
