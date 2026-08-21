import { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConfigProvider } from "./contexts/ConfigContext";
import { Wafflepad } from "./components/Wafflepad";
import "./index.css";

// Suppress the WebView's default context menu (Reload, image actions, …) —
// app and folder tiles show native menus instead (AppItem, FolderItem).
// Editable fields keep the default menu: with no Edit menu in the menu bar,
// right-click Paste is the only paste path into search and rename. Dev
// builds keep the default everywhere so right-click → Inspect Element stays
// available.
if (import.meta.env.PROD) {
  window.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea")) return;
    e.preventDefault();
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <Suspense>
      <ConfigProvider>
        <Wafflepad />
      </ConfigProvider>
    </Suspense>
  </ErrorBoundary>,
);
