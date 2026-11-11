"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Badge, Button, Checkbox, DataTable, Icon, IconButton, Input, Select, type DataTableColumn } from "@index/ui";
import { Dialog } from "../dialog/Dialog.tsx";
import { useOptionalFeedback } from "../feedback/Feedback.tsx";

export interface FormFieldRow {
  readonly id: string;
  readonly name: string;
  /** Ключ типу з fieldTypes. */
  readonly type: string;
  readonly required: boolean;
  /**
   * Поле опубліковане: тип не змінюється (ADR-FORM-002: зміна типу не виконується
   * автоматично — створюють нове поле), а видалення потребує підтвердження, бо сервер
   * має перевірити збережені значення й залежності.
   */
  readonly typeLocked?: boolean;
  /** Поле з централізованого шаблону: локально не видаляється (ADR-FORM-002). */
  readonly inherited?: boolean;
  /**
   * Поле повністю визначає шаблон (VS-DEC-09): назву, тип, обов'язковість і місце
   * змінює лише Оркестратор у шаблоні, тут поле тільки видно. Сервер однаково
   * ігнорує локальні зміни таких полів; блокування в UI не обіцяє неможливого.
   */
  readonly locked?: boolean;
}

export interface FormFieldType {
  readonly value: string;
  readonly label: string;
}

/**
 * Опис зміни для історії власника (Undo/Redo, «Відмінити: …»). group об'єднує послідовні
 * зміни одного поля (набір назви) в один крок.
 */
export interface FormFieldChange {
  readonly label: string;
  readonly group?: string;
}

export interface FormFieldTableProps {
  /** Назва таблиці полів («Поля форми F-12»). */
  readonly label: string;
  readonly fields: readonly FormFieldRow[];
  /** Доступні типи полів; набір задає застосунок (Form V1 — 7 типів). */
  readonly fieldTypes: readonly FormFieldType[];
  /** Новий порядок і значення полів після будь-якої зміни в таблиці та її опис. */
  readonly onFieldsChange: (fields: readonly FormFieldRow[], change: FormFieldChange) => void;
  readonly onAddField: () => void;
  /** Поле, відкрите в інспекторі (детальні налаштування: опис, опції списку). */
  readonly currentFieldId?: string | null;
  readonly onFieldSelect?: (id: string) => void;
  readonly className?: string;
}

const upIcon = <Icon name="move-up" size={16} />;
const downIcon = <Icon name="move-down" size={16} />;
const deleteIcon = <Icon name="delete" size={16} />;
// Загальні налаштування поля; повзунки widget-settings належать віджетам дашборду.
const settingsIcon = <Icon name="settings" size={16} />;
const lockedIcon = <Icon name="field-locked" size={16} />;
const addIcon = <Icon name="add" size={16} />;

// ix-sr-only — публічна утиліта стилів @index/ui (прихований текст для зчитувача).
const srOnly = "ix-sr-only";

/** Куди перенести фокус після зміни переліку: видалений рядок зникає разом із кнопкою. */
type PendingFocus = { readonly kind: "delete"; readonly index: number } | { readonly kind: "add"; readonly count: number };

/**
 * Form Builder (Notion «09», ЗАТВЕРДЖЕНО): впорядкована таблиця полів, без конструктора
 * з боковою бібліотекою. Кожен рядок — порядок, назва, тип, обов'язковість і дії.
 * Порядок змінюється кнопками «вгору/вниз» — доступно з клавіатури без перетягування.
 * Required не блокує збереження запису (ADR-FORM-002), тож це лише позначка.
 *
 * Видалення: чернеткове поле зникає одразу з повідомленням «Відмінити»; опубліковане —
 * лише після підтвердження, бо сервер ще перевіряє значення й залежності (ADR-FORM-002);
 * поле з шаблону не видаляється. Фокус після видалення переходить на сусідній рядок або
 * «Додати поле», а зміни порядку й складу оголошуються зчитувачу.
 */
export function FormFieldTable({ label, fields, fieldTypes, onFieldsChange, onAddField, currentFieldId = null, onFieldSelect, className }: FormFieldTableProps) {
  const feedback = useOptionalFeedback();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pendingFocus = useRef<PendingFocus | null>(null);
  // Актуальний перелік для «Відмінити»: повідомлення живе довше за рендер, у якому створене.
  const latest = useRef(fields);
  latest.current = fields;
  const [announcement, setAnnouncement] = useState("");
  const [confirmField, setConfirmField] = useState<FormFieldRow | null>(null);
  // Пояснення блокування типу: вимкнений Select сам не каже чому, а підказка на ньому не з'явиться.
  const lockHintId = `ixp-field-lock-${useId()}`;
  const hasLocked = fields.some((field) => field.typeLocked && !field.locked);
  const hasTemplateFields = fields.some((field) => field.locked);
  const templateHintId = `ixp-field-template-${useId()}`;

  useEffect(() => {
    const pending = pendingFocus.current;
    const root = rootRef.current;
    if (!pending || !root) return;
    if (pending.kind === "add") {
      if (fields.length <= pending.count) return;
      pendingFocus.current = null;
      const names = root.querySelectorAll<HTMLInputElement>("input[data-field-name]");
      names[names.length - 1]?.focus();
      return;
    }
    pendingFocus.current = null;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("button[data-field-delete]")];
    const target = buttons[Math.min(pending.index, buttons.length - 1)];
    if (target && !target.disabled) target.focus();
    else root.querySelector<HTMLButtonElement>("button[data-field-add]")?.focus();
  }, [fields]);

  const update = (field: FormFieldRow, patch: Partial<FormFieldRow>, change: FormFieldChange): void => {
    onFieldsChange(
      fields.map((item) => (item.id === field.id ? { ...item, ...patch } : item)),
      change,
    );
  };

  const move = (index: number, offset: -1 | 1): void => {
    const next = [...fields];
    const [item] = next.splice(index, 1);
    next.splice(index + offset, 0, item!);
    onFieldsChange(next, { label: `Переміщення поля «${item!.name}»` });
    setAnnouncement(`Поле «${item!.name}» переміщено на позицію ${index + offset + 1} з ${next.length}.`);
  };

  const remove = (field: FormFieldRow): void => {
    const index = fields.indexOf(field);
    pendingFocus.current = { kind: "delete", index };
    onFieldsChange(
      fields.filter((item) => item.id !== field.id),
      { label: `Видалення поля «${field.name}»` },
    );
    setAnnouncement(`Поле «${field.name}» видалено.`);
    const key = `form-field-removed:${field.id}`;
    feedback?.notify({
      key,
      tone: "info",
      title: `Поле «${field.name}» видалено`,
      action: {
        // «Відмінити», як в історії шапки: «Повернути» там означає Redo.
        label: "Відмінити",
        onAction: () => {
          const current = latest.current;
          if (!current.some((item) => item.id === field.id)) {
            const restored = [...current];
            restored.splice(Math.min(index, restored.length), 0, field);
            onFieldsChange(restored, { label: `Повернення поля «${field.name}»` });
            setAnnouncement(`Поле «${field.name}» повернуто.`);
          }
          feedback.dismiss(key);
        },
      },
      duration: 8000,
    });
  };

  const add = (): void => {
    pendingFocus.current = { kind: "add", count: fields.length };
    onAddField();
  };

  const columns: DataTableColumn<FormFieldRow>[] = [
    {
      key: "order",
      header: "№",
      numeric: true,
      width: 56,
      render: (field) => fields.indexOf(field) + 1,
    },
    {
      key: "name",
      header: "Назва поля",
      // Позначка шаблону — біля назви, а не серед дій: інакше кнопки першого рядка зсувалися б.
      render: (field) => (
        <div className="ixp-field-table__name">
          <Input
            label={`Назва поля ${fields.indexOf(field) + 1}`}
            hideLabel
            value={field.name}
            readOnly={field.locked}
            aria-describedby={field.locked ? templateHintId : undefined}
            data-field-name=""
            onChange={(event) => update(field, { name: event.target.value }, { label: `Перейменування поля «${field.name}»`, group: `name:${field.id}` })}
          />
          {field.inherited || field.locked ? (
            <Badge icon={lockedIcon} title="Поле з шаблону: локально не видаляється">
              Шаблон
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "type",
      header: "Тип",
      width: 220,
      render: (field) => (
        <Select
          label={`Тип поля «${field.name}»`}
          hideLabel
          value={field.type}
          disabled={field.typeLocked || field.locked}
          aria-describedby={field.locked ? templateHintId : field.typeLocked ? lockHintId : undefined}
          onChange={(event) => update(field, { type: event.target.value }, { label: `Тип поля «${field.name}»` })}
        >
          {fieldTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: "required",
      header: "Обов'язкове",
      width: 120,
      render: (field) => (
        <Checkbox
          label={`Обов'язкове: ${field.name}`}
          hideLabel
          checked={field.required}
          disabled={field.locked}
          aria-describedby={field.locked ? templateHintId : undefined}
          onChange={(event) => update(field, { required: event.target.checked }, { label: `Обов'язковість поля «${field.name}»` })}
        />
      ),
    },
    {
      key: "actions",
      header: "Дії",
      width: 176,
      render: (field) => {
        const index = fields.indexOf(field);
        return (
          <div className="ixp-field-table__actions">
            {/* Поля шаблону стоять першими й не переміщуються; локальні не стають перед ними. */}
            <IconButton
              label={`Перемістити вгору: ${field.name}`}
              icon={upIcon}
              disabled={index === 0 || field.locked || fields[index - 1]?.locked}
              onClick={() => move(index, -1)}
            />
            <IconButton
              label={`Перемістити вниз: ${field.name}`}
              icon={downIcon}
              disabled={index === fields.length - 1 || field.locked || fields[index + 1]?.locked}
              onClick={() => move(index, 1)}
            />
            {onFieldSelect ? (
              <IconButton label={`Налаштування поля: ${field.name}`} icon={settingsIcon} aria-pressed={field.id === currentFieldId} onClick={() => onFieldSelect(field.id)} />
            ) : null}
            <IconButton
              label={field.inherited || field.locked ? `Поле з шаблону не видаляється: ${field.name}` : `Видалити поле: ${field.name}`}
              icon={deleteIcon}
              disabled={field.inherited || field.locked}
              data-field-delete=""
              onClick={() => (field.typeLocked ? setConfirmField(field) : remove(field))}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div ref={rootRef} className={className === undefined ? "ixp-field-table" : `ixp-field-table ${className}`}>
      <DataTable
        label={label}
        columns={columns}
        rows={fields}
        getRowId={(field) => field.id}
        rowHeaderKey="name"
        currentRowId={currentFieldId}
        density="compact"
        stateTitle="Полів ще немає"
        stateDescription="Додайте перше поле — форма почне приймати записи після активації."
        className="ixp-field-table__table"
      />
      <div className="ixp-field-table__footer">
        <Button iconStart={addIcon} data-field-add="" onClick={add}>
          Додати поле
        </Button>
        {hasTemplateFields ? (
          <p id={templateHintId} className="ixp-field-table__hint">
            {lockedIcon}
            Поля шаблону змінює Оркестратор у шаблоні; тут їх лише видно.
          </p>
        ) : null}
        {hasLocked ? (
          <p id={lockHintId} className="ixp-field-table__hint">
            {lockedIcon}
            Тип опублікованого поля не змінюється: для іншого типу створіть нове поле.
          </p>
        ) : null}
      </div>
      {/* Регіон існує постійно: зчитувач пропускає повідомлення, додані разом із регіоном. */}
      <div className={srOnly} aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <Dialog
        open={confirmField !== null}
        onClose={() => setConfirmField(null)}
        kind="confirm"
        title={`Видалити поле «${confirmField?.name ?? ""}»?`}
        description="Поле вже опубліковане. Сервер видалить його лише після перевірки збережених значень і залежностей (Filter, Merge, Dashboard, Unit Output); історичні значення й ревізії залишаться."
        actions={
          <>
            <Button onClick={() => setConfirmField(null)}>Скасувати</Button>
            <Button
              variant="destructive"
              onClick={() => {
                const field = confirmField;
                setConfirmField(null);
                if (field) remove(field);
              }}
            >
              Видалити поле
            </Button>
          </>
        }
      />
    </div>
  );
}
