import { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "./contexts/ConfigContext";
import { AppWaffle } from "./components/AppWaffle";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <Suspense>
    <ConfigProvider>
      <AppWaffle />
    </ConfigProvider>
  </Suspense>,
);
