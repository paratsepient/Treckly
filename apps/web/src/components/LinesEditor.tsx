import { Fragment, type Dispatch } from "react";
import { Badge, Button, IconButton, Icon, Input, SegmentedControl, Select } from "@index/ui";
import {
  parseQty,
  replacementCandidates,
  replacementRule,
  type CatalogItem,
  type CatalogPosition,
  type EditorAction,
  type EditorLine,
} from "../lib/editor-state.ts";
import { formatMoney } from "../lib/format.ts";

export interface LinesEditorProps {
  readonly lines: readonly EditorLine[];
  readonly positions: readonly CatalogPosition[];
  readonly items: readonly CatalogItem[];
  readonly dispatch: Dispatch<EditorAction>;
  /** Проблеми автоперевірок за рядками: id рядка → тексти. */
  readonly problems: ReadonlyMap<string, readonly string[]>;
  readonly newLineId: () => string;
  readonly disabled?: boolean;
}

/**
 * Таблиця рядків заявки. У наборі немає редагованої таблиці, тому вона зібрана з Input,
 * Select і SegmentedControl набору. Рядок — це позиція Попереднього переліку з кількістю,
 * для заміни ще й предмет, на який міняють, із поясненням, чи витрачається ліміт КЕКВ.
 */
export function LinesEditor({ lines, positions, items, dispatch, problems, newLineId, disabled = false }: LinesEditorProps) {
  const byId = new Map(positions.map((p) => [p.id, p]));
  const itemsById = new Map(items.map((i) => [i.id, i]));

  return (
    <div className="lines">
      <table className="lines__table">
        <caption className="lines__caption">Рядки заявки</caption>
        <thead>
          <tr>
            <th scope="col" className="lines__num">
              №
            </th>
            <th scope="col">Тип рядка</th>
            <th scope="col">Позиція Попереднього переліку</th>
            <th scope="col" className="lines__qty">
              Кількість
            </th>
            <th scope="col">КЕКВ</th>
            <th scope="col" className="lines__money">
              Сума
            </th>
            <th scope="col" className="lines__actions">
              <span className="ix-sr-only">Дії</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const position = byId.get(line.positionId);
            const qty = parseQty(line.qty);
            const item = itemsById.get(line.replacementItemId);
            const row = index + 1;
            const issues = problems.get(line.id) ?? [];
            const unit = line.kind === "replacement" ? item?.priceMinor : position?.priceMinor;
            const sum = unit !== undefined && qty !== null ? unit * qty : null;
            const candidates = line.kind === "replacement" ? replacementCandidates(position, items) : [];
            const rule = position && item ? replacementRule(position, item) : null;
            return (
              <Fragment key={line.id}>
              <tr className="lines__row" data-invalid={issues.length > 0 ? "true" : undefined}>
                <th scope="row" className="lines__num">
                  {row}
                </th>
                <td>
                  <SegmentedControl
                    label={`Тип рядка ${row}`}
                    hideLabel
                    disabled={disabled}
                    value={line.kind}
                    onValueChange={(value) => dispatch({ type: "update", id: line.id, patch: { kind: value as EditorLine["kind"] } })}
                    options={[
                      { value: "by_list", label: "За переліком" },
                      { value: "replacement", label: "Заміна" },
                    ]}
                  />
                </td>
                <td>
                  <Select
                    label={`Позиція, рядок ${row}`}
                    hideLabel
                    disabled={disabled}
                    placeholder="Оберіть позицію"
                    value={line.positionId}
                    onChange={(event) => dispatch({ type: "update", id: line.id, patch: { positionId: event.target.value } })}
                  >
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name} (доступно {p.availableQty})
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="lines__qty">
                  <Input
                    label={`Кількість, рядок ${row}`}
                    hideLabel
                    disabled={disabled}
                    inputMode="numeric"
                    value={line.qty}
                    error={line.qty !== "" && qty === null ? "Ціле число більше нуля" : undefined}
                    onChange={(event) => dispatch({ type: "update", id: line.id, patch: { qty: event.target.value }, group: `qty:${line.id}` })}
                  />
                </td>
                <td>{position ? <Badge>{position.kekv}</Badge> : <span className="lines__muted">—</span>}</td>
                <td className="lines__money">{sum !== null ? formatMoney(sum) : <span className="lines__muted">—</span>}</td>
                <td className="lines__actions">
                  <IconButton
                    label={`Видалити рядок ${row}`}
                    icon={<Icon name="delete" />}
                    disabled={disabled}
                    onClick={() => dispatch({ type: "remove", id: line.id })}
                  />
                </td>
              </tr>
              {line.kind === "replacement" || issues.length > 0 ? (
                <tr className="lines__detail-row">
                  <td className="lines__detail" colSpan={7}>
                    {line.kind === "replacement" ? (
                      <div className="lines__replacement">
                        <Select
                          label={`Замінити на, рядок ${row}`}
                          disabled={disabled || !position}
                          placeholder={position ? "Оберіть предмет заміни" : "Спершу оберіть позицію"}
                          value={line.replacementItemId}
                          onChange={(event) => dispatch({ type: "update", id: line.id, patch: { replacementItemId: event.target.value } })}
                        >
                          {candidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} · КЕКВ {c.kekv} · {formatMoney(c.priceMinor)}
                            </option>
                          ))}
                        </Select>
                        {rule === "same-kekv" ? <Badge tone="success">Той самий КЕКВ: ліміт не витрачається</Badge> : null}
                        {rule === "other-kekv" && item ? <Badge tone="warning">{`Інший КЕКВ: списується з ліміту ${item.kekv}`}</Badge> : null}
                      </div>
                    ) : null}
                    {issues.length > 0 ? (
                      <ul className="lines__issues" aria-label={`Проблеми рядка ${row}`}>
                        {issues.map((text) => (
                          <li key={text}>{text}</li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="lines__footer">
        <Button iconStart={<Icon name="add" />} disabled={disabled} onClick={() => dispatch({ type: "add", line: { id: newLineId(), kind: "by_list", positionId: "", qty: "1", replacementItemId: "" } })}>
          Додати рядок
        </Button>
      </div>
    </div>
  );
}
