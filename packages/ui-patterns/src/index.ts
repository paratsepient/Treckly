// Публічний API пакета.
// Внутрішні модулі не імпортуємо напряму.
// Стилі: `@index/ui-patterns/styles.css` (включає @index/ui і токени).

export { AppShell, useAppShell, type AppShellContextValue, type AppShellProps } from "./shell/AppShell.tsx";
export { AppSidebar, type AppSidebarProps, type NavGroup, type NavItem } from "./shell/AppSidebar.tsx";
export {
  WorkspaceLayout,
  useWorkspacePanels,
  type PanelControl,
  type PanelPresentation,
  type WorkspaceLayoutProps,
  type WorkspacePanels,
} from "./workspace/WorkspaceLayout.tsx";
export { WorkspaceHeader, type Breadcrumb, type WorkspaceHeaderProps } from "./workspace/WorkspaceHeader.tsx";
export { SaveStatus, type SaveState, type SaveStatusProps } from "./workspace/SaveStatus.tsx";
export {
  WorkspaceSurface,
  useWorkspaceSurfaceSize,
  type SurfaceSize,
  type SurfaceVariant,
  type WorkspaceSurfaceProps,
} from "./workspace/WorkspaceSurface.tsx";
export { ContextPanel, type ContextPanelProps, type ContextPanelSearch } from "./panels/ContextPanel.tsx";
export { InspectorPanel, useInspector, type InspectorPanelProps, type InspectorTab } from "./panels/InspectorPanel.tsx";
export { ToolbarGroup, ToolbarSeparator, WorkspaceToolbar, type WorkspaceToolbarProps } from "./toolbar/WorkspaceToolbar.tsx";
export { Drawer, type DrawerProps } from "./drawer/Drawer.tsx";
export { Dialog, type DialogProps } from "./dialog/Dialog.tsx";
// Form Builder: впорядкована таблиця полів (Notion «09», ЗАТВЕРДЖЕНО).
export { FormFieldTable, type FormFieldChange, type FormFieldRow, type FormFieldTableProps, type FormFieldType } from "./form-builder/FormFieldTable.tsx";
export {
  MAX_VISIBLE_FEEDBACK,
  useFeedback,
  type FeedbackAction,
  type FeedbackMessage,
  type FeedbackTone,
} from "./feedback/Feedback.tsx";
export { TreeView, type TreeItem, type TreeViewProps } from "./tree/TreeView.tsx";
