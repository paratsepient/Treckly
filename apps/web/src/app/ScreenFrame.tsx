import type { ReactNode } from "react";
import { WorkspaceHeader, WorkspaceLayout, WorkspaceSurface, type Breadcrumb, type SaveStatusProps } from "@index/ui-patterns";
import { useApiQuery } from "../api/hooks.tsx";
import { formatDate } from "../lib/format.ts";
import { DemoPanel } from "./DemoPanel.tsx";

export interface ScreenFrameProps {
  readonly title: string;
  readonly breadcrumbs?: readonly Breadcrumb[];
  readonly meta?: ReactNode;
  readonly documentState?: string;
  readonly saveStatus?: SaveStatusProps;
  readonly primaryAction?: ReactNode;
  /** Другорядні дії екрана (WorkspaceToolbar); демо-панель додається після них. */
  readonly actions?: ReactNode;
  readonly inspector?: ReactNode;
  readonly inspectorOpen?: boolean;
  readonly onInspectorOpenChange?: (open: boolean) => void;
  readonly inspectorKey?: string;
  readonly inspectorLabel?: string;
  readonly surfaceLabel: string;
  readonly children: ReactNode;
}

/**
 * Каркас екрана: заголовок, демо-панель, банер «Демонстраційні дані» з симульованою датою
 * (видно на всіх екранах) і робоча поверхня, що прокручується.
 */
export function ScreenFrame(props: ScreenFrameProps) {
  const session = useApiQuery("session");
  return (
    <WorkspaceLayout
      header={
        <WorkspaceHeader
          title={props.title}
          {...(props.breadcrumbs ? { breadcrumbs: props.breadcrumbs } : {})}
          {...(props.meta !== undefined ? { meta: props.meta } : {})}
          {...(props.documentState ? { documentState: props.documentState } : {})}
          {...(props.saveStatus ? { saveStatus: props.saveStatus } : {})}
          {...(props.primaryAction ? { primaryAction: props.primaryAction } : {})}
          actions={
            <>
              {props.actions}
              <DemoPanel />
            </>
          }
        />
      }
      {...(props.inspector ? { inspector: props.inspector, inspectorLabel: props.inspectorLabel ?? "Картка" } : {})}
      {...(props.inspectorOpen !== undefined ? { inspectorOpen: props.inspectorOpen } : {})}
      {...(props.onInspectorOpenChange ? { onInspectorOpenChange: props.onInspectorOpenChange } : {})}
      {...(props.inspectorKey !== undefined ? { inspectorKey: props.inspectorKey } : {})}
    >
      {/* Префікс робить назву унікальною: таблиці й секції всередині мають власні назви (landmark-unique). */}
      <WorkspaceSurface variant="dashboard" label={`Робоча область: ${props.surfaceLabel}`}>
        <div className="screen" data-inspector={props.inspector && props.inspectorOpen !== false ? "open" : undefined}>
          <p className="demo-banner" role="note">
            <strong>Демонстраційні дані, СЕДО імітується.</strong>
            {session.data ? ` Сьогодні: ${formatDate(session.data.today)}` : ""}
          </p>
          {props.children}
        </div>
      </WorkspaceSurface>
    </WorkspaceLayout>
  );
}
