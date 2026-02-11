import { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConfigProvider } from "./contexts/ConfigContext";
import { AppWaffle } from "./components/AppWaffle";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <Suspense>
      <ConfigProvider>
        <AppWaffle />
      </ConfigProvider>
    </Suspense>
  </ErrorBoundary>,
);
