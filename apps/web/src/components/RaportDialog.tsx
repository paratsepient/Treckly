import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, DataState, Icon } from "@index/ui";
import { Dialog, useFeedback } from "@index/ui-patterns";
import { useApiQuery } from "../api/hooks.tsx";
import { requestLabel } from "../lib/format.ts";
import { buildRaportHtml, raportModel, type RaportInput } from "../lib/raport.ts";
import { printHtml } from "../lib/reports.ts";

/** Ширина аркуша А4 у CSS-пікселях: перегляд масштабується під ширину діалогу. */
const A4_WIDTH = 794;

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

/** Перегляд аркуша: справжня ширина А4, зменшена під місце в діалозі. */
function RaportPreview({ html, label }: { readonly html: string; readonly label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const update = () => setScale(Math.min(1, element.clientWidth / A4_WIDTH));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} className="raport-preview" style={{ height: height * scale }}>
      <iframe
        className="raport-preview__page"
        title={label}
        srcDoc={html}
        style={{ width: A4_WIDTH, height, transform: `scale(${scale})` }}
        onLoad={(event) => {
          const doc = event.currentTarget.contentDocument;
          if (doc) setHeight(Math.max(1123, doc.documentElement.scrollHeight));
        }}
      />
    </div>
  );
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
  const feedback = useFeedback();
  const session = useApiQuery("session");
  const [saving, setSaving] = useState(false);
  const input = useRaportInput(request);
  const html = useMemo(() => (open && input ? buildRaportHtml(input) : ""), [open, input]);
  const title = request ? `Рапорт ${requestLabel(request.id)}` : "Рапорт";
  const missingJustification = request !== undefined && request.justification.trim() === "";
  const foreign = request !== undefined && session.data !== undefined && session.data.user.id !== request.authorId;
  const authorName = request ? session.data?.users.find((u) => u.id === request.authorId)?.name : undefined;

  const download = async () => {
    if (!input) return;
    setSaving(true);
    try {
      // Бібліотека Word вантажиться окремим шматком лише тут, а не з першим екраном.
      const { buildRaportDocx, downloadBlob } = await import("../lib/docx-export.ts");
      downloadBlob(await buildRaportDocx(input), raportModel(input).fileName);
    } catch (error) {
      feedback.notify({ key: "raport-docx-error", tone: "error", title: "Не вдалося сформувати Word", description: error instanceof Error ? error.message : "Невідома помилка" });
    } finally {
      setSaving(false);
    }
  };

  const description = missingJustification
    ? "Обґрунтування ще не написано: у рапорті на його місці буде позначка. Решту заповнено за шаблоном."
    : foreign
      ? `Рапорт для ознайомлення${authorName ? `, автор — ${authorName}` : ""}. Позиції й обґрунтування вводить автор, решту заповнено за шаблоном.`
      : "Позиції й обґрунтування — ваші, решту заповнено за шаблоном. Підпис і військове звання — від руки після друку.";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="medium"
      description={description}
      actions={
        <>
          {extraActions}
          <Button variant="secondary" iconStart={<Icon name="save" />} loading={saving} loadingLabel="Формування Word" disabled={!input} onClick={() => void download()}>
            Завантажити Word
          </Button>
          <Button variant="primary" iconStart={<Icon name="share" />} disabled={!input} onClick={() => printHtml(html)}>
            Друкувати
          </Button>
        </>
      }
    >
      {input ? <RaportPreview html={html} label={`Перегляд: ${title}`} /> : <DataState kind="loading" size="compact" title="Готуємо рапорт…" />}
    </Dialog>
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
