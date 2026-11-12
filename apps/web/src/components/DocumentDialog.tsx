import { useEffect, useRef, useState, type ReactNode } from "react";
import { DataState, Icon, IconButton } from "@index/ui";
import { Dialog, useFeedback } from "@index/ui-patterns";
import { printHtml } from "../lib/reports.ts";

/** Ширина аркуша А4 у CSS-пікселях: перегляд масштабується під ширину діалогу. */
const A4_WIDTH = 794;

/** Перегляд аркуша: справжня ширина А4, зменшена під місце в діалозі. */
function SheetPreview({ html, label }: { readonly html: string; readonly label: string }) {
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

export interface DocumentActionsProps {
  /** HTML документа для друку; null — ще готується. */
  readonly html: string | null;
  /** Word будується на вимогу: бібліотека `docx` вантажиться окремим шматком лише тут. */
  readonly makeDocx: (() => Promise<Blob>) | null;
  readonly fileName: string;
  /** Назва документа для підказок кнопок («витяг», «рапорт»). */
  readonly what: string;
}

/** Друк і завантаження Word одного документа — значками з підказками. */
export function DocumentActions({ html, makeDocx, fileName, what }: DocumentActionsProps) {
  const feedback = useFeedback();
  const [saving, setSaving] = useState(false);
  const download = async () => {
    if (!makeDocx) return;
    setSaving(true);
    try {
      const { downloadBlob } = await import("../lib/docx-export.ts");
      downloadBlob(await makeDocx(), fileName);
    } catch (error) {
      feedback.notify({ key: "docx-error", tone: "error", title: "Не вдалося сформувати Word", description: error instanceof Error ? error.message : "Невідома помилка" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <span className="raport-tools">
      <IconButton
        variant="secondary"
        label={`Завантажити ${what} (Word)`}
        icon={<Icon name="save" />}
        loading={saving}
        loadingLabel="Формування Word"
        disabled={!makeDocx}
        onClick={() => void download()}
      />
      <IconButton variant="secondary" label={`Друкувати ${what}`} icon={<Icon name="sheet" />} disabled={html === null} onClick={() => html !== null && printHtml(html)} />
    </span>
  );
}

export interface DocumentDialogProps extends DocumentActionsProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description: string;
  /** Рішення поруч із документом (наприклад, «Повернути…», «Додати до переліку»). */
  readonly extraActions?: ReactNode;
}

/** Документ на аркуші А4 для перегляду, друку й завантаження в Word: рапорт, витяг тощо. */
export function DocumentDialog({ open, onClose, title, description, extraActions, ...doc }: DocumentDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="medium"
      description={description}
      actions={
        <>
          <DocumentActions {...doc} />
          {extraActions}
        </>
      }
    >
      {doc.html !== null ? <SheetPreview html={doc.html} label={`Перегляд: ${title}`} /> : <DataState kind="loading" size="compact" title="Готуємо документ…" />}
    </Dialog>
  );
}
