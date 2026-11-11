"use client";

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "@index/ui";

export interface TreeItem {
  readonly id: string;
  readonly label: string;
  /** Другий рядок дрібним текстом (кількість, роль). */
  readonly description?: string;
  /** Декоративна іконка типу; назву дає label. */
  readonly icon?: ReactNode;
  /** Позначка праворуч (Badge «Мій підрозділ»): текстом, не лише кольором. */
  readonly badge?: ReactNode;
  readonly children?: readonly TreeItem[];
  /**
   * false — вузол лише групує (візуальна група підрозділів): Enter і клік його
   * розгортають, а не вибирають. За замовчуванням вузол вибирається.
   */
  readonly selectable?: boolean;
}

export interface TreeViewProps {
  /** Доступна назва дерева («Підрозділи»). */
  readonly label: string;
  readonly items: readonly TreeItem[];
  readonly selectedId?: string | null;
  readonly onSelect?: (id: string) => void;
  /** Розгорнуті на старті; предки вибраного розгортаються завжди. */
  readonly defaultExpandedIds?: readonly string[];
  readonly className?: string;
}

interface Visible {
  readonly item: TreeItem;
  readonly level: number;
  readonly parent: string | null;
}

/**
 * Дерево за APG Tree View (Notion «UX · Організаційна структура»): одна зупинка Tab
 * (roving tabindex), ↑/↓ між видимими вузлами, Home/End, → розгортає вузол або веде до
 * першого дочірнього, ← згортає або повертає до батька, Enter/Space вибирає (вузол-група —
 * розгортає). Клік по шевроні лише розгортає, по рядку — вибирає.
 *
 * Вибраний стан — aria-selected і смуга-індикатор; у forced-colors його дублює контур,
 * бо фон там зникає. Вкладеність — відступ за рівнем, не лише лінії.
 */
export function TreeView({ label, items, selectedId = null, onSelect, defaultExpandedIds = [], className }: TreeViewProps) {
  const parents = useMemo(() => {
    const map = new Map<string, string | null>();
    const walk = (nodes: readonly TreeItem[], parent: string | null): void => {
      for (const node of nodes) {
        map.set(node.id, parent);
        if (node.children) walk(node.children, node.id);
      }
    };
    walk(items, null);
    return map;
  }, [items]);

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    const initial = new Set(defaultExpandedIds);
    // Вибраний вузол видно одразу: його предки розгорнуті.
    for (let id = selectedId ? parents.get(selectedId) : null; id; id = parents.get(id) ?? null) initial.add(id);
    return initial;
  });
  const [focused, setFocused] = useState<string | null>(selectedId);
  const treeRef = useRef<HTMLUListElement | null>(null);

  const visible: Visible[] = [];
  const collect = (nodes: readonly TreeItem[], level: number, parent: string | null): void => {
    for (const node of nodes) {
      visible.push({ item: node, level, parent });
      if (node.children?.length && expanded.has(node.id)) collect(node.children, level + 1, node.id);
    }
  };
  collect(items, 1, null);

  // Вузол у фокусі міг зникнути (пошук, згортання): тоді Tab веде до вибраного або першого.
  const active = visible.some((v) => v.item.id === focused)
    ? focused
    : visible.some((v) => v.item.id === selectedId)
      ? selectedId
      : (visible[0]?.item.id ?? null);

  const focusItem = (id: string | null | undefined): void => {
    if (!id) return;
    setFocused(id);
    treeRef.current?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`)?.focus();
  };

  const toggle = (id: string, open: boolean): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const activate = (item: TreeItem): void => {
    if (item.selectable === false) toggle(item.id, !expanded.has(item.id));
    else onSelect?.(item.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    const index = visible.findIndex((v) => v.item.id === active);
    const current = visible[index];
    if (!current) return;
    const hasChildren = Boolean(current.item.children?.length);
    const open = expanded.has(current.item.id);
    const handled = (() => {
      switch (event.key) {
        case "ArrowDown":
          focusItem(visible[Math.min(index + 1, visible.length - 1)]?.item.id);
          return true;
        case "ArrowUp":
          focusItem(visible[Math.max(index - 1, 0)]?.item.id);
          return true;
        case "Home":
          focusItem(visible[0]?.item.id);
          return true;
        case "End":
          focusItem(visible.at(-1)?.item.id);
          return true;
        case "ArrowRight":
          if (hasChildren && !open) toggle(current.item.id, true);
          else if (hasChildren) focusItem(visible[index + 1]?.item.id);
          return true;
        case "ArrowLeft":
          if (hasChildren && open) toggle(current.item.id, false);
          else focusItem(current.parent);
          return true;
        case "Enter":
        case " ":
          activate(current.item);
          return true;
        default:
          return false;
      }
    })();
    if (handled) event.preventDefault();
  };

  const render = (nodes: readonly TreeItem[], level: number): ReactNode =>
    nodes.map((node) => {
      const hasChildren = Boolean(node.children?.length);
      const open = expanded.has(node.id);
      const selectable = node.selectable !== false;
      return (
        <li
          key={node.id}
          role="treeitem"
          aria-level={level}
          aria-expanded={hasChildren ? open : undefined}
          aria-selected={selectable ? node.id === selectedId : undefined}
          aria-label={node.description ? `${node.label}, ${node.description}` : undefined}
          tabIndex={active === node.id ? 0 : -1}
          data-tree-id={node.id}
          data-group={selectable ? undefined : ""}
          className="ixp-tree__item"
          onFocus={(event) => {
            if (event.target === event.currentTarget) setFocused(node.id);
          }}
          onClick={(event) => {
            event.stopPropagation();
            activate(node);
            focusItem(node.id);
          }}
        >
          <div className="ixp-tree__row" style={{ "--ixp-tree-level": level - 1 } as CSSProperties}>
            {hasChildren ? (
              <span
                className="ixp-tree__toggle"
                aria-hidden="true"
                onClick={(event) => {
                  // Шеврона лише розгортає: вибір лишається за рядком.
                  event.stopPropagation();
                  toggle(node.id, !open);
                  focusItem(node.id);
                }}
              >
                <Icon name={open ? "collapse" : "expand"} size={16} />
              </span>
            ) : (
              <span className="ixp-tree__toggle" aria-hidden="true" />
            )}
            {node.icon !== undefined ? (
              <span className="ixp-tree__icon" aria-hidden="true">
                {node.icon}
              </span>
            ) : null}
            <span className="ixp-tree__text">
              <span className="ixp-tree__label">{node.label}</span>
              {node.description ? <span className="ixp-tree__description">{node.description}</span> : null}
            </span>
            {node.badge !== undefined ? <span className="ixp-tree__badge">{node.badge}</span> : null}
          </div>
          {hasChildren && open ? <ul role="group">{render(node.children!, level + 1)}</ul> : null}
        </li>
      );
    });

  return (
    <ul ref={treeRef} role="tree" aria-label={label} className={className === undefined ? "ixp-tree" : `ixp-tree ${className}`} onKeyDown={onKeyDown}>
      {render(items, 1)}
    </ul>
  );
}
