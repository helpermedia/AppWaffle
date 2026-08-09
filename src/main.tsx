import { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConfigProvider } from "./contexts/ConfigContext";
import { Wafflepad } from "./components/Wafflepad";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <Suspense>
      <ConfigProvider>
        <Wafflepad />
      </ConfigProvider>
    </Suspense>
  </ErrorBoundary>,
);
