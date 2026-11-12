import { useMemo, useState, type ReactNode } from "react";
import { Button, Icon } from "@index/ui";
import { useApiQuery } from "../api/hooks.tsx";
import { requestLabel } from "../lib/format.ts";
import { buildRaportHtml, raportModel, type RaportInput } from "../lib/raport.ts";
import { DocumentDialog } from "./DocumentDialog.tsx";

type RaportRequest = RaportInput["request"];

/** Зібрати вхід шаблону з довідників сесії: автор, назви підрозділів, позиції, одиниці виміру. */
function useRaportInput(request: (RaportRequest & { readonly authorId: string }) | undefined): RaportInput | undefined {
  const session = useApiQuery("session");
  const reference = useApiQuery("reference");
  const positions = useApiQuery("positions");
  return useMemo(() => {
    if (!request || !session.data || !reference.data || !positions.data) return undefined;
    const units = new Map(reference.data.units.map((u) => [u.id, u.name]));
    const author = session.data.users.find((u) => u.id === request.authorId);
    const editable = request.status === "draft" || request.status === "returned";
    return {
      request,
      author: author ? { name: author.name, title: author.title } : undefined,
      unitName: (id: string) => units.get(id) ?? id,
      positions: positions.data.positions,
      items: reference.data.items,
      // Чернетку друкують сьогодні; подана заявка має свою дату.
      date: editable ? session.data.today : request.createdOn,
    };
  }, [request, session.data, reference.data, positions.data]);
}

export interface RaportDialogProps {
  readonly request: (RaportRequest & { readonly authorId: string }) | undefined;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Додаткові кнопки ліворуч від «Завантажити Word» (наприклад, «Повернути…» для того, хто перевіряє). */
  readonly extraActions?: ReactNode;
}

/**
 * Діалог рапорту: аркуш за шаблоном, друк і Word. Автор уводив лише позиції й обґрунтування;
 * адресат, текст прохання, таблиці й підпис система заповнює сама. Той, хто перевіряє чужу
 * заявку, бачить той самий аркуш для ознайомлення.
 */
export function RaportDialog({ request, open, onClose, extraActions }: RaportDialogProps) {
  const session = useApiQuery("session");
  const input = useRaportInput(request);
  const html = useMemo(() => (open && input ? buildRaportHtml(input) : null), [open, input]);
  const title = request ? `Рапорт ${requestLabel(request.id)}` : "Рапорт";
  const missingJustification = request !== undefined && request.justification.trim() === "";
  const foreign = request !== undefined && session.data !== undefined && session.data.user.id !== request.authorId;
  const authorName = request ? session.data?.users.find((u) => u.id === request.authorId)?.name : undefined;

  const description = missingJustification
    ? "Обґрунтування ще не написано: у рапорті на його місці буде позначка. Решту заповнено за шаблоном."
    : foreign
      ? `Рапорт для ознайомлення${authorName ? `, автор — ${authorName}` : ""}. Позиції й обґрунтування вводить автор, решту заповнено за шаблоном.`
      : "Позиції й обґрунтування — ваші, решту заповнено за шаблоном. Підпис і військове звання — від руки після друку.";

  return (
    <DocumentDialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      html={html}
      makeDocx={input ? async () => (await import("../lib/docx-export.ts")).buildRaportDocx(input) : null}
      fileName={input ? raportModel(input).fileName : "Рапорт.docx"}
      what="рапорт"
      extraActions={extraActions}
    />
  );
}

export interface RaportButtonProps {
  readonly request: (RaportRequest & { readonly authorId: string }) | undefined;
  /** Підпис кнопки: «Рапорт» у картці, «Переглянути рапорт» на екрані заявки. */
  readonly label?: string;
  readonly variant?: "secondary" | "ghost";
  readonly disabled?: boolean;
}

/** Кнопка «Рапорт»: відкриває діалог рапорту. */
export function RaportButton({ request, label = "Рапорт", variant = "secondary", disabled }: RaportButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} iconStart={<Icon name="document" />} disabled={disabled || request === undefined || request.lines.length === 0} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <RaportDialog request={request} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
