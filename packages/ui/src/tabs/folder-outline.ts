/**
 * Контур «папки» вкладок: вибрана вкладка, увігнуті вигини переходу й панель як одна
 * фігура. Світіння фокуса малюється по цьому контуру одним шаром — окремі шари вкладки
 * й панелі накладалися б і давали шви на напівпрозорих фазах пульсу.
 */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const n = (value: number): string => String(Math.round(value * 100) / 100);

/**
 * Шлях за годинниковою стрілкою. tab і panel — у координатах кореня Tabs; стик — верхній
 * край панелі (вкладка заходить у панель, але контур іде по панелі). radius — радіус
 * кутів панелі, вкладки й вигинів (--ix-radius-container). Перша вкладка стоїть на краю
 * панелі: лівого вигину немає, а лівий верхній кут панелі прямий.
 */
export function folderOutlinePath(tab: Box, panel: Box, radius: number): string {
  const r = radius;
  const y = panel.top;
  const flushStart = Math.abs(tab.left - panel.left) < 0.5;
  const parts: string[] = [];
  if (flushStart) {
    parts.push(`M${n(panel.left)} ${n(panel.bottom - r)}`, `V${n(tab.top + r)}`);
  } else {
    parts.push(
      `M${n(panel.left)} ${n(panel.bottom - r)}`,
      `V${n(y + r)}`,
      `A${n(r)} ${n(r)} 0 0 1 ${n(panel.left + r)} ${n(y)}`,
      `H${n(tab.left - r)}`,
      // Увігнутий вигин: центр над стиком, зовні вкладки.
      `A${n(r)} ${n(r)} 0 0 0 ${n(tab.left)} ${n(y - r)}`,
      `V${n(tab.top + r)}`,
    );
  }
  parts.push(
    `A${n(r)} ${n(r)} 0 0 1 ${n(tab.left + r)} ${n(tab.top)}`,
    `H${n(tab.right - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(tab.right)} ${n(tab.top + r)}`,
    `V${n(y - r)}`,
    `A${n(r)} ${n(r)} 0 0 0 ${n(tab.right + r)} ${n(y)}`,
    `H${n(panel.right - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(panel.right)} ${n(y + r)}`,
    `V${n(panel.bottom - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(panel.right - r)} ${n(panel.bottom)}`,
    `H${n(panel.left + r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(panel.left)} ${n(panel.bottom - r)}`,
    "Z",
  );
  return parts.join("");
}

/** Вимірює вибрану вкладку й панель у корені групи; без «папки» контуру немає. */
export function measureFolderOutline(root: HTMLElement): string {
  const tab = root.querySelector<HTMLElement>(":scope > [data-pulse-links] > [data-pulse-trigger]");
  const panel = root.querySelector<HTMLElement>(":scope > [data-pulse-link]:not([hidden])");
  if (!tab || !panel) return "";
  const origin = root.getBoundingClientRect();
  const relative = (element: HTMLElement): Box => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top };
  };
  const radius = Number.parseFloat(getComputedStyle(panel).borderTopRightRadius) || 0;
  return folderOutlinePath(relative(tab), relative(panel), radius);
}
