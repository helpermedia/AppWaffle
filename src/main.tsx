import React from "react";
import ReactDOM from "react-dom/client";
import { AppWaffle } from "./components/AppWaffle";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppWaffle />
  </React.StrictMode>,
);
