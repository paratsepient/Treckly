import { useState } from "react";
import { Button, Input } from "@index/ui";
import { Dialog } from "@index/ui-patterns";

export interface SedoDialogProps {
  readonly open: boolean;
  /** Рівень 5 — затвердження Головою: інші слова й наслідки (резерв бюджету, витяги). */
  readonly final: boolean;
  readonly requestCount: number;
  readonly totalText: string;
  readonly pending: boolean;
  /** Помилка від сервера (SEDO_NUMBER_INVALID, BUDGET_EXCEEDED, …): показується під полем. */
  readonly error?: string | undefined;
  readonly onClose: () => void;
  readonly onConfirm: (sedoNumber: string) => void;
}

/**
 * Погодження денного переліку: одне поле — числовий номер СЕДО, одна дія. Без номера
 * перелік не погодити. Формат (число) перевіряє домен; його відповідь показується під полем.
 */
export function SedoDialog(props: SedoDialogProps) {
  return <SedoDialogBody key={props.open ? "open" : "closed"} {...props} />;
}

function SedoDialogBody({ open, final, requestCount, totalText, pending, error, onClose, onConfirm }: SedoDialogProps) {
  const [value, setValue] = useState("");
  const verb = final ? "Затвердити" : "Погодити";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${verb} денний перелік?`}
      description={
        final
          ? `Заявок: ${requestCount}, на суму ${totalText}. Затвердження резервує бюджет і формує витяги по в/ч; після нього заявки вже не відкликати.`
          : `Заявок: ${requestCount}, на суму ${totalText}. Усі вони разом перейдуть на наступний рівень. Часткового погодження немає.`
      }
      kind="confirm"
      actions={
        <>
          <Button onClick={onClose}>Скасувати</Button>
          <Button variant="primary" loading={pending} loadingLabel="Погодження" disabled={value.trim() === ""} onClick={() => onConfirm(value)}>
            {verb}
          </Button>
        </>
      }
    >
      <Input
        label="Номер СЕДО"
        description="Лише цифри, без пробілів і літер. СЕДО імітується: номер вводять вручну."
        required
        inputMode="numeric"
        autoComplete="off"
        value={value}
        error={error}
        onChange={(event) => setValue(event.target.value)}
      />
    </Dialog>
  );
}
