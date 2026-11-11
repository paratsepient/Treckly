// Публічний API пакета.
// Внутрішні модулі не імпортуємо напряму.
// Стилі підключаються окремо: `@index/ui/styles.css` (включає токени).

export { Button, type ButtonProps, type ButtonVariant } from "./button/Button.tsx";
export { IconButton, type IconButtonProps } from "./button/IconButton.tsx";
export { Input, type InputProps, type InputType } from "./input/Input.tsx";
export { Textarea, type TextareaProps } from "./input/Textarea.tsx";
export { Checkbox, type CheckboxProps } from "./choice/Checkbox.tsx";
export { Switch, type SwitchProps } from "./choice/Switch.tsx";
export { Radio, RadioGroup, type RadioGroupProps, type RadioProps } from "./choice/Radio.tsx";
export { Select, type SelectProps } from "./select/Select.tsx";
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from "./segmented/SegmentedControl.tsx";
export { ScrollArea, type ScrollAreaProps } from "./scroll-area/ScrollArea.tsx";
export { Tab, TabList, TabPanel, Tabs, type TabListProps, type TabPanelProps, type TabProps, type TabsProps } from "./tabs/Tabs.tsx";
export { Tooltip, type TooltipPlacement, type TooltipProps } from "./tooltip/Tooltip.tsx";
// Плаваючі панелі біля тригера.
export { Popover, type PopoverProps, type PopoverTriggerProps } from "./popover/Popover.tsx";
export { Menu, type MenuAction, type MenuEntry, type MenuProps, type MenuSeparator } from "./popover/Menu.tsx";
export type { FloatingAlign, FloatingSide } from "./internal/position.ts";
// Контейнери, позначки й стани даних.
export { Card, type CardProps } from "./card/Card.tsx";
export { Badge, type BadgeProps, type BadgeTone } from "./feedback/Badge.tsx";
export { DataState, type DataStateKind, type DataStateProps } from "./feedback/DataState.tsx";
export {
  DataTable,
  type DataTableColumn,
  type DataTableProps,
  type SortDirection,
  type TableSort,
} from "./table/DataTable.tsx";
// Графовий редактор: полотно, ноди з портами, ребра, фрейми.
export {
  GraphCanvas,
  graphZoomLimits,
  graphZoomStep,
  type GraphCanvasHandle,
  type GraphCanvasProps,
  type GraphEdgeLayout,
  type GraphEdgeSpec,
  type GraphEdgeState,
  type GraphFrameLayout,
  type GraphLayoutChange,
  type GraphNodeLayout,
  type GraphView,
  type GraphViewportInsets,
} from "./graph/GraphCanvas.tsx";
// Крок сітки полотна: власник застосовує його, ставлячи нові ноди.
export { graphGridStep, type Point as GraphPoint, type Rect as GraphRect } from "./graph/layout/geometry.ts";
export { GraphNode, type GraphNodeProps, type GraphNodeStatus, type GraphPortSpec } from "./graph/GraphNode.tsx";
export { GraphFrame, type GraphFrameProps } from "./graph/GraphFrame.tsx";
// Кільцеві діаграми (частини одного цілого).
export {
  DonutChart,
  PieChart,
  type ChartDatum,
  type ChartTone,
  type DonutChartProps,
  type RadialChartProps,
} from "./chart/RadialChart.tsx";
export { BarChart, type BarChartProps, type BarDatum } from "./chart/BarChart.tsx";
export { KpiTile, type KpiDelta, type KpiTileProps } from "./chart/KpiTile.tsx";
// Двоколірні іконки IndeX.
export { Icon, type IconProps, type IconSize } from "./icon/Icon.tsx";
export { iconNames, type IconName } from "./icon/icons.ts";
// Емблема IndeX у кольорах теми.
export { Emblem, type EmblemProps } from "./brand/Emblem.tsx";
// Пульсація фокуса для власних фокусованих елементів (разом із класом .ix-focus-pulse на хості).
export { FocusPulse } from "./internal/FocusPulse.tsx";
