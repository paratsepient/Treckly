"use client";

import { useContext, useId, useLayoutEffect, type CSSProperties, type KeyboardEvent } from "react";
import { Icon } from "../icon/Icon.tsx";
import { cx } from "../internal/class-names.ts";
import { GraphCanvasContext } from "./context.ts";
import { graphGridStep } from "./layout/geometry.ts";
import { collapsedFrameRect } from "./layout/scene.ts";

export interface GraphFrameProps {
  /** Id фрейма: на нього посилаються ноди (GraphNode frame) і зміни розкладки. */
  readonly id: string;
  readonly label: string;
  /** Положення й розмір у px полотна (розгорнутий стан). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Згорнутий фрейм — компактний блок; його ноди й внутрішні ребра приховані. */
  readonly collapsed?: boolean;
  readonly className?: string;
}

/** Українська форма слова «нода» для числа. */
function nodesWord(count: number): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return "нод";
  if (units === 1) return "нода";
  if (units >= 2 && units <= 4) return "ноди";
  return "нод";
}

/**
 * Frame — лише візуальна група нод (ADR-GRAPH-001: не авторизація і не межа Unit),
 * тому пунктирний контур без тла й тіні: він не схожий на контейнер з даними.
 *
 * На редагованому полотні заголовок — кнопка: клік згортає чи розгортає фрейм, перетягування
 * переносить його разом із нодами, стрілки зсувають на клітинку сітки. Згорнутий фрейм
 * показує кількість нод, а зовнішні ребра ведуть до його краю.
 */
export function GraphFrame({ id, label, x, y, width, height, collapsed = false, className }: GraphFrameProps) {
  const hintId = `ix-graph-frame-hint-${useId()}`;
  const canvas = useContext(GraphCanvasContext);
  const { registerFrame } = canvas;

  useLayoutEffect(() => registerFrame(id, { x, y, width, height, collapsed }), [registerFrame, id, x, y, width, height, collapsed]);

  const box = collapsed ? collapsedFrameRect({ x, y, width, height }) : { x, y, width, height };
  const preview = canvas.framePreview.get(id);
  const count = canvas.memberCount.get(id) ?? 0;
  const style = {
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height,
    transform: preview ? `translate(${preview.dx}px, ${preview.dy}px)` : undefined,
  } satisfies CSSProperties;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const step = event.shiftKey ? graphGridStep * 4 : graphGridStep;
    const offsets: Record<string, readonly [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    canvas.moveBy({ kind: "frame", id }, offset[0], offset[1]);
  };

  const summary = collapsed ? `${count} ${nodesWord(count)}` : null;
  return (
    <div
      className={cx("ix-graph-frame", className)}
      style={style}
      role="group"
      aria-label={`Фрейм: ${label}`}
      data-graph-frame={id}
      data-collapsed={collapsed ? "" : undefined}
      data-dragging={preview ? "" : undefined}
    >
      {canvas.editable ? (
        <button
          type="button"
          className="ix-graph-frame__header"
          data-graph-frame-handle={id}
          aria-expanded={!collapsed}
          aria-describedby={hintId}
          onClick={() => canvas.toggleFrame(id)}
          onKeyDown={onKeyDown}
        >
          <Icon name={collapsed ? "expand" : "collapse"} size={16} />
          <span className="ix-graph-frame__label">{label}</span>
          {summary ? <span className="ix-graph-frame__count">{summary}</span> : null}
          <span id={hintId} className="ix-sr-only">
            {collapsed ? "Розгорнути фрейм" : "Згорнути фрейм"}. Стрілки переміщують фрейм разом із нодами.
          </span>
        </button>
      ) : (
        <span className="ix-graph-frame__header" aria-hidden="true">
          <span className="ix-graph-frame__label">{label}</span>
          {summary ? <span className="ix-graph-frame__count">{summary}</span> : null}
        </span>
      )}
    </div>
  );
}
