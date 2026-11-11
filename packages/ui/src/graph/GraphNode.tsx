"use client";

import { useContext, useId, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Badge, type BadgeTone } from "../feedback/Badge.tsx";
import { Icon } from "../icon/Icon.tsx";
import { cx } from "../internal/class-names.ts";
import { GraphCanvasContext } from "./context.ts";
import { graphGridStep } from "./layout/geometry.ts";

export interface GraphPortSpec {
  /** Повний id порту на полотні (`<нода>:<порт>`), на нього посилаються ребра. */
  readonly id: string;
  readonly label: string;
  /** До порту під'єднано ребро: сокет заповнений. */
  readonly connected?: boolean;
  /** Несумісний тип чи зламана залежність: червоне кільце і текст у стані ноди. */
  readonly invalid?: boolean;
}

export interface GraphNodeStatus {
  readonly tone: BadgeTone;
  /** Коротко й видимо: «Не налаштовано», «Немає джерела» (ADR-GRAPH-001). */
  readonly label: string;
  readonly icon?: ReactNode;
}

export interface GraphNodeProps {
  /** Id ноди на полотні: за ним полотно повідомляє нові положення (onLayoutChange). */
  readonly id: string;
  /** Тип ноди (Form, Filter, Split, Merge, Dashboard, Unit Input/Output). */
  readonly type: string;
  readonly name: string;
  /** Іконка типу; форма іконки відрізняє типи без кольору. */
  readonly icon?: ReactNode;
  /** Координати лівого верхнього кута в px полотна (вузол сітки 20). */
  readonly x: number;
  readonly y: number;
  /**
   * Закріплена нода не тягнеться і не розсувається, коли поруч кидають іншу: її положення
   * зафіксоване свідомо (наприклад, вхід від іншого підрозділу завжди ліворуч).
   */
  readonly pinned?: boolean;
  /** Фрейм, якому належить нода; полотно оновлює належність, коли ноду кидають у фрейм чи з нього. */
  readonly frame?: string;
  readonly inputs?: readonly GraphPortSpec[];
  readonly outputs?: readonly GraphPortSpec[];
  readonly status?: GraphNodeStatus;
  readonly selected?: boolean;
  /** Клік по заголовку; подія — для модифікаторів (Shift / Ctrl додають ноду до виділення). */
  readonly onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
  /**
   * Подвійний клік по заголовку відкриває вміст ноди (граф підрозділу, конструктор форми,
   * дашборд). Це лише швидкий шлях: той самий перехід застосунок дає й дією в інспекторі,
   * тож він досяжний з клавіатури.
   */
  readonly onOpen?: () => void;
  readonly className?: string;
}

/** Стрілки зсувають ноду на клітинку сітки, із Shift — на чотири. */
const keyStep = graphGridStep;
const keyStepLarge = graphGridStep * 4;

function Port({ port, side }: { readonly port: GraphPortSpec; readonly side: "input" | "output" }) {
  return (
    <li className="ix-graph-port" data-side={side} data-connected={port.connected ? "" : undefined} data-invalid={port.invalid ? "" : undefined}>
      <span className="ix-graph-port__socket" data-graph-port={port.id} aria-hidden="true" />
      <span className="ix-graph-port__label">{port.label}</span>
      {/* Стан порту для зчитувача: сокет — лише візуальна точка. */}
      {port.connected || port.invalid ? (
        <span className="ix-sr-only">{port.invalid ? ", помилка з'єднання" : ", під'єднано"}</span>
      ) : null}
    </li>
  );
}

/**
 * Нода графа: заголовок із типом і назвою (кнопка вибору), входи ліворуч, виходи
 * праворуч, стан під портами. Нода — об'єкт усередині полотна, тому тінь вкладена
 * (floating-nested) і не виходить за межі фрейму.
 *
 * Переміщенням керує полотно (GraphCanvas з onLayoutChange): нода тягнеться за будь-яке
 * місце, а з клавіатури — стрілками на заголовку. Нода лише реєструє своє положення і
 * показує тимчасовий зсув попереднього результату.
 */
export function GraphNode({ id, type, name, icon, x, y, pinned = false, frame, inputs = [], outputs = [], status, selected = false, onSelect, onOpen, className }: GraphNodeProps) {
  const nameId = `ix-graph-node-${useId()}`;
  const hintId = `ix-graph-node-hint-${useId()}`;
  const canvas = useContext(GraphCanvasContext);
  const element = useRef<HTMLDivElement | null>(null);
  const { registerNode } = canvas;

  useLayoutEffect(() => {
    if (!element.current) return undefined;
    return registerNode(id, { x, y, pinned, frame, element: element.current });
  }, [registerNode, id, x, y, pinned, frame]);

  const movable = canvas.editable && !pinned;
  const preview = canvas.preview.get(id);
  const hidden = canvas.hidden.has(id);
  const style = {
    left: x,
    top: y,
    transform: preview ? `translate(${preview.dx}px, ${preview.dy}px)` : undefined,
  } satisfies CSSProperties;

  const onHeaderKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!movable) return;
    const step = event.shiftKey ? keyStepLarge : keyStep;
    const offsets: Record<string, readonly [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    canvas.moveBy({ kind: "node", id }, offset[0], offset[1]);
  };
  const heading = (
    <>
      <span className="ix-graph-node__type">
        {icon !== undefined ? (
          <span className="ix-graph-node__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {type}
        {pinned ? (
          <span className="ix-graph-node__pin">
            <Icon name="field-locked" size={16} />
            <span className="ix-sr-only">, закріплено</span>
          </span>
        ) : null}
      </span>
      <span id={nameId} className="ix-graph-node__name">
        {name}
      </span>
    </>
  );
  return (
    <div
      ref={element}
      className={cx("ix-graph-node", className)}
      role="group"
      aria-labelledby={nameId}
      data-graph-node={id}
      data-selected={selected ? "" : undefined}
      data-movable={movable ? "" : undefined}
      data-pinned={pinned ? "" : undefined}
      data-dragging={preview?.mode === "drag" ? "" : undefined}
      data-pushed={preview?.mode === "push" ? "" : undefined}
      data-hidden={hidden ? "" : undefined}
      // Нода в згорнутому фреймі зберігає розміри (полотно їх вимірює), але недосяжна.
      inert={hidden}
      aria-hidden={hidden || undefined}
      style={style}
    >
      {onSelect ? (
        // aria-current, не aria-pressed: вибір ноди — «поточна в наборі», а не перемикач «натиснуто».
        <button
          type="button"
          className="ix-graph-node__header"
          aria-current={selected ? "true" : undefined}
          aria-describedby={movable ? hintId : undefined}
          onClick={onSelect}
          onDoubleClick={onOpen ? () => onOpen() : undefined}
          onKeyDown={onHeaderKeyDown}
        >
          {heading}
        </button>
      ) : (
        <div className="ix-graph-node__header">{heading}</div>
      )}
      {inputs.length > 0 || outputs.length > 0 ? (
        <div className="ix-graph-node__ports">
          {/* Порожній перелік лишається для сітки (виходи завжди праворуч), але не для зчитувача. */}
          <ul className="ix-graph-node__port-list" aria-label={inputs.length > 0 ? "Входи" : undefined} aria-hidden={inputs.length > 0 ? undefined : true}>
            {inputs.map((port) => (
              <Port key={port.id} port={port} side="input" />
            ))}
          </ul>
          <ul className="ix-graph-node__port-list" aria-label={outputs.length > 0 ? "Виходи" : undefined} aria-hidden={outputs.length > 0 ? undefined : true}>
            {outputs.map((port) => (
              <Port key={port.id} port={port} side="output" />
            ))}
          </ul>
        </div>
      ) : null}
      {movable ? (
        <span id={hintId} className="ix-sr-only">
          Стрілки переміщують ноду на клітинку сітки, із Shift — на чотири. Нода, поставлена на іншу, розсуває сусідів.
        </span>
      ) : null}
      {status ? (
        <div className="ix-graph-node__status">
          <Badge tone={status.tone} icon={status.icon}>
            {status.label}
          </Badge>
        </div>
      ) : null}
    </div>
  );
}
