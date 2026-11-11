import { createContext } from "react";
import type { MoveSubject } from "./layout/scene.ts";

/** Нода, як її бачить полотно: положення — дані власника, розмір і сокети — вимір DOM. */
export interface GraphNodeEntry {
  readonly x: number;
  readonly y: number;
  readonly pinned: boolean;
  readonly frame: string | undefined;
  readonly element: HTMLElement;
}

export interface GraphFrameEntry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly collapsed: boolean;
}

/** Тимчасовий зсув під час перетягування: сам об'єкт (drag) чи розсунутий сусід (push). */
export interface GraphPreview {
  readonly dx: number;
  readonly dy: number;
  readonly mode: "drag" | "push";
}

export interface GraphCanvasContextValue {
  /**
   * Поточний масштаб: функція, а не число — вид змінюється частіше за рендер нод,
   * і обробник читає актуальне значення в момент дії.
   */
  readonly zoom: () => number;
  /** Реєстрація ноди чи фрейма; повертає скасування реєстрації. */
  readonly registerNode: (id: string, entry: GraphNodeEntry) => () => void;
  readonly registerFrame: (id: string, entry: GraphFrameEntry) => () => void;
  /** Полотно приймає зміни розкладки (є onLayoutChange): ноди й фрейми рухаються. */
  readonly editable: boolean;
  readonly preview: ReadonlyMap<string, GraphPreview>;
  readonly framePreview: ReadonlyMap<string, GraphPreview>;
  /** Ноди всередині згорнутих фреймів. */
  readonly hidden: ReadonlySet<string>;
  /** Кількість нод у кожному фреймі — підпис згорнутого фрейма. */
  readonly memberCount: ReadonlyMap<string, number>;
  /** Переміщення з клавіатури: той самий план, що й мишею (сітка, розсування, вільне місце). */
  readonly moveBy: (subject: MoveSubject, dx: number, dy: number) => void;
  readonly toggleFrame: (id: string) => void;
}

const noop = (): void => undefined;
const empty = new Map<string, never>();

export const GraphCanvasContext = createContext<GraphCanvasContextValue>({
  zoom: () => 1,
  registerNode: () => noop,
  registerFrame: () => noop,
  editable: false,
  preview: empty,
  framePreview: empty,
  hidden: new Set(),
  memberCount: empty,
  moveBy: noop,
  toggleFrame: noop,
});
