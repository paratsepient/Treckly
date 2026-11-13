import { Fragment, type Dispatch } from "react";
import { Badge, Button, IconButton, Icon, Input, Select } from "@index/ui";
import {
  parseQty,
  parseMoney,
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
 * Таблиця рядків заявки з типізованими стовпцями. У наборі немає редагованої таблиці, тому вона
 * зібрана з Input і Select набору: тип рядка й позиція — вибір зі списку. Рядок — це позиція Попереднього переліку з кількістю,
 * для заміни ще й предмет, на який міняють, із поясненням, чи витрачається ліміт КЕКВ.
 */
export function LinesEditor({ lines, positions, items, dispatch, problems, newLineId, disabled = false }: LinesEditorProps) {
  const byId = new Map(positions.map((p) => [p.id, p]));
  // КЕКВ, які можна обрати для нового предмета: ті, що є в довіднику.
  const kekvs = [...new Set([...items.map((i) => i.kekv), ...positions.map((p) => p.kekv)])].sort();

  return (
    <div className="lines">
      <h2 className="lines__title" aria-hidden="true">
        Рядки заявки
      </h2>
      <div className="lines__well">
      <table className="lines__table ix-table" data-variant="well">
        <caption className="ix-sr-only">Рядки заявки</caption>
        <thead>
          <tr>
            <th scope="col" className="ix-table__header lines__num">
              №
            </th>
            <th scope="col" className="ix-table__header lines__type">
              Що робимо
            </th>
            <th scope="col" className="ix-table__header">Позиція переліку</th>
            <th scope="col" className="ix-table__header lines__qty">
              Кількість
            </th>
            <th scope="col" className="ix-table__header lines__kekv">
              КЕКВ
            </th>
            <th scope="col" className="ix-table__header lines__money">
              Сума
            </th>
            <th scope="col" className="ix-table__header lines__actions">
              <span className="ix-sr-only">Дії</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const position = byId.get(line.positionId);
            const qty = parseQty(line.qty);
            const row = index + 1;
            const issues = problems.get(line.id) ?? [];
            const replacing = line.kind === "replacement";
            // Заміна: межа — сума того, що замінюють (кількість × ціна позиції); сума рядка — сума нового предмета.
            const limit = position && qty !== null ? position.priceMinor * qty : null;
            const newTotal = parseMoney(line.newTotal);
            const newKekv = line.newKekv || position?.kekv || "";
            const sum = replacing ? newTotal : position && qty !== null ? position.priceMinor * qty : null;
            const over = replacing && newTotal !== null && limit !== null && newTotal > limit;
            return (
              <Fragment key={line.id}>
              <tr className="lines__row ix-table__row" data-invalid={issues.length > 0 ? "true" : undefined}>
                <th scope="row" className="ix-table__cell lines__num">
                  {row}
                </th>
                <td className="ix-table__cell lines__cell-type">
                  <Select
                    label={`Тип рядка ${row}`}
                    hideLabel
                    disabled={disabled}
                    value={line.kind}
                    onChange={(event) => dispatch({ type: "update", id: line.id, patch: { kind: event.target.value as EditorLine["kind"] } })}
                  >
                    <option value="by_list">Купити як заплановано</option>
                    <option value="replacement">Замінити на інше</option>
                  </Select>
                </td>
                <td className="ix-table__cell lines__cell-position">
                  <Select
                    label={`Позиція, рядок ${row}`}
                    hideLabel
                    disabled={disabled}
                    placeholder="Оберіть позицію"
                    value={line.positionId}
                    {...(position ? { title: `${position.code} · ${position.name} (можна замовити ${position.availableQty})` } : {})}
                    onChange={(event) => dispatch({ type: "update", id: line.id, patch: { positionId: event.target.value } })}
                  >
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {/* Коротко, щоб назва вміщалася в поле: код, назва, скільки ще можна замовити. */}
                        {`${p.name} · ${p.code} · до ${p.availableQty}`}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="ix-table__cell lines__qty">
                  <Input
                    label={replacing ? `Скільки замінюємо, рядок ${row}` : `Кількість, рядок ${row}`}
                    hideLabel
                    disabled={disabled}
                    inputMode="numeric"
                    value={line.qty}
                    error={line.qty !== "" && qty === null ? "Ціле число більше нуля" : undefined}
                    onChange={(event) => dispatch({ type: "update", id: line.id, patch: { qty: event.target.value }, group: `qty:${line.id}` })}
                  />
                </td>
                <td className="ix-table__cell lines__cell-kekv">
                  <span className="lines__cell-label" aria-hidden="true">КЕКВ</span>
                  {/* Для заміни на предмет іншого КЕКВ видно, з якого ліміту списується: «2210 → 3110». */}
                  {position ? <Badge>{replacing && newKekv !== position.kekv ? `${position.kekv} → ${newKekv}` : position.kekv}</Badge> : <span className="lines__muted">—</span>}
                </td>
                <td className="ix-table__cell lines__money">
                  <span className="lines__cell-label" aria-hidden="true">Сума</span>
                  {sum !== null ? formatMoney(sum) : <span className="lines__muted">—</span>}
                </td>
                <td className="ix-table__cell lines__actions">
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
                  <td className="ix-table__cell lines__detail" colSpan={7}>
                    {line.kind === "replacement" ? (
                      <div className="lines__replacement">
                        {/* Підписи — одним рядком над полями; самі поля мають повну назву для читача з екрана. */}
                        <span className="lines__replacement-head" aria-hidden="true">Що натомість</span>
                        <span className="lines__replacement-head" aria-hidden="true">Кількість</span>
                        <span className="lines__replacement-head" aria-hidden="true">{limit !== null ? `Сума, грн (до ${formatMoney(limit)})` : "Сума, грн"}</span>
                        <span className="lines__replacement-head" aria-hidden="true">КЕКВ</span>
                        <Input
                          label={`Що натомість, рядок ${row}`}
                          hideLabel
                          disabled={disabled}
                          placeholder="Найменування предмета"
                          maxLength={160}
                          value={line.newName}
                          onChange={(event) => dispatch({ type: "update", id: line.id, patch: { newName: event.target.value }, group: `name:${line.id}` })}
                        />
                        <Input
                          label={`Кількість нового, рядок ${row}`}
                          hideLabel
                          disabled={disabled}
                          inputMode="numeric"
                          value={line.newQty}
                          error={line.newQty !== "" && parseQty(line.newQty) === null ? "Ціле число більше нуля" : undefined}
                          onChange={(event) => dispatch({ type: "update", id: line.id, patch: { newQty: event.target.value }, group: `nqty:${line.id}` })}
                        />
                        <Input
                          label={`Сума, грн, рядок ${row}`}
                          hideLabel
                          disabled={disabled}
                          inputMode="decimal"
                          value={line.newTotal}
                          error={over ? "Більше за суму того, що замінюєте" : line.newTotal !== "" && newTotal === null ? "Сума в гривнях, напр. 8000 або 8000,50" : undefined}
                          onChange={(event) => dispatch({ type: "update", id: line.id, patch: { newTotal: event.target.value }, group: `total:${line.id}` })}
                        />
                        <Select
                          label={`КЕКВ нового, рядок ${row}`}
                          hideLabel
                          disabled={disabled || !position}
                          value={newKekv}
                          onChange={(event) => dispatch({ type: "update", id: line.id, patch: { newKekv: event.target.value } })}
                        >
                          {kekvs.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </Select>
                        {position && newKekv === position.kekv ? <Badge tone="success">Той самий КЕКВ: ліміт не витрачається</Badge> : null}
                        {position && newKekv !== position.kekv ? <Badge tone="warning">{`Інший КЕКВ: списується з ліміту ${newKekv}`}</Badge> : null}
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
      </div>
      <div className="lines__footer">
        <Button iconStart={<Icon name="add" />} disabled={disabled} onClick={() => dispatch({ type: "add", line: { id: newLineId(), kind: "by_list", positionId: "", qty: "1", newName: "", newQty: "1", newTotal: "", newKekv: "", condition: "" } })}>
          Додати рядок
        </Button>
      </div>
    </div>
  );
}
