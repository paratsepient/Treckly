import { useState } from "react";
import { Button, Textarea } from "@index/ui";
import { Dialog } from "@index/ui-patterns";

export interface ReturnDialogProps {
  readonly open: boolean;
  /** Номер заявки для людей (ЗМ-…). */
  readonly label: string;
  /** Рівень, який повертає заявку: від нього залежить, кого буде сповіщено. */
  readonly level: number;
  readonly pending: boolean;
  /** Помилка від сервера (наприклад, примітка порожня): показується під полем. */
  readonly error?: string | undefined;
  readonly onClose: () => void;
  readonly onConfirm: (note: string) => void;
}

/** Кого буде сповіщено: рівні нижче того, що повертає (правило 3: каскад до автора). */
function notified(level: number): string {
  if (level <= 1) return "Автор отримає сповіщення з вашою приміткою.";
  if (level === 2) return "Автор і рівень 1 отримають сповіщення з вашою приміткою.";
  return `Автор і рівні від 1 до ${level - 1} отримають сповіщення з вашою приміткою.`;
}

/**
 * Повернення заявки автору з обов'язковою приміткою (правило 3). Діалог пояснює наслідки:
 * заявка йде автору, а нижчі рівні отримують сповіщення з приміткою.
 */
export function ReturnDialog(props: ReturnDialogProps) {
  // Стан діалогу скидається разом із ним: нова заявка — чиста примітка.
  return <ReturnDialogBody key={props.open ? props.label : "closed"} {...props} />;
}

function ReturnDialogBody({ open, label, level, pending, error, onClose, onConfirm }: ReturnDialogProps) {
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const empty = note.trim() === "";
  const shown = error ?? (touched && empty ? "Примітка обов'язкова: автор має зрозуміти, що виправити." : undefined);

  const confirm = () => {
    setTouched(true);
    if (!empty) onConfirm(note.trim());
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Повернути заявку ${label}?`}
      description={`Заявка піде автору на виправлення. ${notified(level)} Нова версія піде з першого рівня.`}
      kind="confirm"
      actions={
        <>
          <Button onClick={onClose}>Не повертати</Button>
          <Button variant="destructive" loading={pending} loadingLabel="Повернення заявки" onClick={confirm}>
            Повернути автору
          </Button>
        </>
      }
    >
      <Textarea
        label="Примітка до повернення"
        description="Обов'язкова. Її побачить автор і нижчі рівні."
        required
        value={note}
        error={shown}
        onChange={(event) => setNote(event.target.value)}
        onBlur={() => setTouched(true)}
      />
    </Dialog>
  );
}
