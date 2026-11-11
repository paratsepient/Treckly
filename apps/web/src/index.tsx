// Точка входу: спершу запускається бекенд у браузері (Hono + PGlite), потім — застосунок.
// Стилі підключаються через публічні exports пакетів, як у будь-якого споживача.
import "@index/ui-patterns/styles.css";
import "./shell.css";
import "./app.css";
import "./content.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, DataState } from "@index/ui";
import { App } from "./app/App.tsx";
import { bootBackend, DemoOpenElsewhereError } from "./backend.ts";
import { initialTheme } from "./lib/storage.ts";

type Boot =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly transport: typeof fetch }
  | { readonly status: "error"; readonly message: string; readonly elsewhere: boolean };

function Boot() {
  const [state, setState] = useState<Boot>({ status: "loading" });
  useEffect(() => {
    document.documentElement.dataset["theme"] = initialTheme();
    bootBackend().then(
      ({ fetch }) => setState({ status: "ready", transport: fetch }),
      (error: unknown) =>
        setState({ status: "error", message: error instanceof Error ? error.message : String(error), elsewhere: error instanceof DemoOpenElsewhereError }),
    );
  }, []);

  if (state.status === "ready") return <App transport={state.transport} />;
  return (
    <main className="boot">
      {state.status === "loading" ? (
        <DataState kind="loading" title="Запуск демо…" description="Перший запуск наповнює локальну базу демо-даними; це займає кілька секунд." />
      ) : state.elsewhere ? (
        <DataState
          kind="denied"
          title="Демо вже відкрите в іншій вкладці"
          description="Локальна база даних працює лише в одній вкладці одночасно. Закрийте іншу вкладку з демо й повторіть."
          action={
            <Button variant="primary" onClick={() => location.reload()}>
              Повторити
            </Button>
          }
        />
      ) : (
        <DataState
          kind="error"
          title="Не вдалося запустити демо"
          description={state.message}
          action={
            <Button
              variant="primary"
              onClick={() => {
                // Локальна база могла пошкодитись: видаляємо її й перезапускаємо, дані створяться заново.
                const request = indexedDB.deleteDatabase("/pglite/dsp-orders");
                request.onsuccess = request.onerror = request.onblocked = () => location.reload();
              }}
            >
              Скинути локальні дані й повторити
            </Button>
          }
        />
      )}
    </main>
  );
}

const container = document.getElementById("root");
if (container) createRoot(container).render(<StrictMode><Boot /></StrictMode>);
