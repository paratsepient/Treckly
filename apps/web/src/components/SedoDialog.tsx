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
  /** Подання рапорту автором: номер реєстрації рапорту в СЕДО замість погодження переліку. */
  readonly raport?: { readonly resubmit: boolean } | undefined;
}

/**
 * Погодження денного переліку: одне поле — числовий номер СЕДО, одна дія. Без номера
 * перелік не погодити. Формат (число) перевіряє домен; його відповідь показується під полем.
 */
export function SedoDialog(props: SedoDialogProps) {
  return <SedoDialogBody key={props.open ? "open" : "closed"} {...props} />;
}

function SedoDialogBody({ open, final, requestCount, totalText, pending, error, onClose, onConfirm, raport }: SedoDialogProps) {
  const [value, setValue] = useState("");
  const verb = raport ? (raport.resubmit ? "Подати нову версію" : "Подати") : final ? "Підписано Головою" : "Погодити";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={raport ? "Номер рапорту в СЕДО" : final ? "Відмітити підпис Голови?" : `${verb} денний перелік?`}
      description={
        raport
          ? `Зареєструйте рапорт у СЕДО (переглянути й роздрукувати його можна кнопкою «Переглянути рапорт») і введіть реєстраційний номер. Сума рапорту: ${totalText}.${raport.resubmit ? " Нова версія — новий рапорт і новий номер." : ""}`
          : final
          ? `Голова підписав роздрукований перелік: заявок ${requestCount}, на суму ${totalText}. Відмітка резервує бюджет і формує витяги по в/ч; після неї заявки вже не відкликати.`
          : `Заявок: ${requestCount}, на суму ${totalText}. Усі вони разом перейдуть на наступний рівень. Часткового погодження немає.`
      }
      kind="confirm"
      actions={
        <>
          <Button onClick={onClose}>Скасувати</Button>
          <Button variant="primary" loading={pending} loadingLabel={raport ? "Подання заявки" : "Погодження"} disabled={value.trim() === ""} onClick={() => onConfirm(value)}>
            {verb}
          </Button>
        </>
      }
    >
      <Input
        label={raport ? "Реєстраційний номер рапорту в СЕДО" : "Номер СЕДО"}
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
