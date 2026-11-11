/**
 * Інтерактивний перегляд Foundations.
 *
 * Дані беруться лише з generated/tokens.json і generated/contrast-report.json;
 * кольори на сторінці малює CSS через змінні з generated/tokens.css.
 * Light і Dark — два окремі перегляди з однаковою структурою: перемикач
 * змінює data-theme і повністю перебудовує вміст для вибраної теми.
 */

const themesList = ["light", "dark"];

/**
 * Створює DOM-елемент. Текст вставляється через textContent, тому дані з JSON
 * не можуть стати розміткою.
 * @param {string} tag
 * @param {Record<string, string> | null} [attrs]
 * @param {...(Node | string | null | undefined | false)} children
 */
function h(tag, attrs, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    element.setAttribute(name, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return element;
}

const cssVar = (name) => `var(--ix-${name})`;

function section(eyebrow, title, note, ...content) {
  return h(
    "section",
    { class: "section", "aria-labelledby": `s-${eyebrow}` },
    h("p", { class: "section__eyebrow" }, eyebrow),
    h("h2", { class: "section__title", id: `s-${eyebrow}` }, title),
    note ? h("p", { class: "section__note" }, note) : null,
    ...content,
  );
}

function table(headers, rows, rowAttrs = () => null) {
  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      null,
      h("thead", null, h("tr", null, ...headers.map((header) => h("th", { scope: "col" }, header)))),
      h("tbody", null, ...rows.map((cells, index) => h("tr", rowAttrs(index), ...cells.map((cell) => (cell instanceof Node && cell.nodeName === "TD" ? cell : h("td", null, cell)))))),
    ),
  );
}

function primitivesSection(tokens) {
  const { steps, colors } = tokens.primitives;
  const scaleNames = [...new Set(Object.keys(colors).filter((name) => name.includes("-")).map((name) => name.split("-")[0]))];
  const rows = scaleNames.map((scale) =>
    h(
      "div",
      { class: "scale" },
      h("div", { class: "scale__name" }, scale),
      ...steps.map((step) => {
        const name = `${scale}-${step}`;
        return h(
          "div",
          { class: "swatch" },
          h("div", { class: "swatch__chip", style: `background: var(--ix-color-${name})` }),
          h("span", { class: "swatch__label" }, String(step)),
          h("span", { class: "swatch__hex" }, colors[name]),
        );
      }),
    ),
  );
  return section(
    "primitives",
    "Primitive color scales",
    "Фізичні кольори, однакові в обох темах: gray-100 має той самий HEX у Light і Dark. Компоненти не використовують примітиви напряму.",
    ...rows,
    h("p", { class: "muted" }, `white — ${colors.white}`),
  );
}

function semanticSection(tokens, theme) {
  const mapping = tokens.semantic[theme];
  const rows = Object.entries(mapping).map(([name, token]) => [
    h("code", null, name),
    h("span", { class: "chip chip--layer", title: token.value }, h("span", { style: `background: ${cssVar(name)}` })),
    h("code", null, token.tint ? `${token.ref} + ${token.tint.ref} ${Math.round(token.tint.amount * 100)}%` : token.alpha === undefined ? token.ref : `${token.ref} @ ${token.alpha}`),
    h("code", null, token.value),
    h("code", { class: "muted" }, token.cssVariable),
  ]);
  return section(
    "semantic",
    `Semantic tokens — ${theme}`,
    "Однакові назви в обох темах; змінюються лише посилання на примітиви. Напівпрозорі токени показано поверх surface.",
    table(["Token", "Колір", "Primitive", "Значення", "CSS variable"], rows),
  );
}

function typographySection(tokens) {
  const { styles, weights } = tokens.typography;
  const samples = {
    "heading-xl": "Оперативна зведена панель",
    "heading-lg": "Потоки донесень",
    "heading-md": "Підрозділи та форми",
    "heading-sm": "Параметри фільтра",
    "body-lg": "Довгий пояснювальний текст для інструкцій і описів процедур, де важлива комфортна довжина рядка.",
    body: "Основний робочий текст таблиць, полів і меню. Чисельність: 1 248 записів.",
    "body-strong": "Мітка поля або кнопки",
    caption: "Допоміжний текст: оновлено 03.11.2026 о 14:20",
    overline: "Службовий підпис групи",
    mono: "UNIT-0427 · 50.4501, 30.5234 · 2026-11-03T14:20:00Z",
  };
  const rows = Object.entries(styles).map(([name, style]) =>
    h(
      "div",
      { class: "type-row" },
      h(
        "div",
        null,
        h("code", null, name),
        h("div", { class: "muted mono" }, `${style.size}/${style.lineHeight} · ${weights[style.weight]}`),
        h("div", { class: "muted" }, style.usage),
      ),
      h(
        "p",
        {
          class: "type-row__sample",
          style: `font: ${cssVar(`font-${name}`)}; letter-spacing: ${cssVar(`font-${name}-letter-spacing`)};${style.textTransform ? ` text-transform: ${style.textTransform};` : ""}`,
        },
        samples[name] ?? name,
      ),
    ),
  );
  return section(
    "typography",
    "Typography",
    "Inter постачається локально (fonts/inter, SIL OFL 1.1) через generated/fonts.css; системні шрифти — лише fallback.",
    ...rows,
  );
}

function spacingSection(tokens) {
  const rows = Object.entries(tokens.spacing).map(([name, value]) =>
    h(
      "div",
      { class: "space-row" },
      h("code", null, `space-${name}`),
      h("span", { class: "mono muted" }, `${value}px`),
      h("div", { class: "space-row__bar", style: `width: ${cssVar(`space-${name}`)}` }),
    ),
  );
  return section("spacing", "Spacing", "Крок 4 px. Назва — множник кроку: space-3 = 12 px.", ...rows);
}

function radiusSection(tokens) {
  const tiles = Object.entries(tokens.radius).map(([name, token]) =>
    h(
      "div",
      { class: "tile", style: `border-radius: ${cssVar(`radius-${name}`)}` },
      h("code", null, `radius-${name}`),
      h("p", { class: "tile__value" }, `${token.value}px`),
      h("p", { class: "muted" }, token.usage),
    ),
  );
  return section("radius", "Radius", "Радіус обирається за призначенням елемента. 16 px відхилено як надто м'який для щільного інтерфейсу.", h("div", { class: "tiles" }, ...tiles));
}

function elevationSection(tokens) {
  const cards = Object.entries(tokens.elevation.levels).map(([name, level]) => {
    const style = [
      `background: ${cssVar(level.surface)}`,
      level.border ? `border: 1px solid ${cssVar(level.border)}` : "border: 1px dashed transparent",
      level.shadow === null ? "" : `box-shadow: ${cssVar(`shadow-${level.shadow}`)}`,
    ].join("; ");
    return h(
      "div",
      { class: "elevation-card", style },
      h("p", { class: "overline" }, `Рівень ${level.level}`),
      h("p", { class: "tile__value" }, name),
      h("p", { class: "muted" }, level.usage),
    );
  });
  return section(
    "elevation",
    "Elevation",
    "Soft Elevation: Flat, Card, Floating, Modal. Ієрархія панелей — тоном і контуром; тінь (контактна + розсіяна) лише в карток і плаваючих шарів.",
    h("div", { class: "elevation-stage" }, h("div", { class: "tiles" }, ...cards)),
  );
}

function focusSection() {
  return section(
    "focus",
    "Focus vs Selected",
    "Натисніть Tab, щоб пройти елементами. Фокус — помаранчевий контур із відступом поза елементом; вибір — оливкова заливка з індикатором. Ці стани не можуть виглядати однаково.",
    h(
      "div",
      { class: "compare" },
      h("div", { class: "compare__item" }, h("span", { class: "overline" }, "Default"), h("span", { class: "pill-target" }, "Підрозділ А")),
      h("div", { class: "compare__item" }, h("span", { class: "overline" }, "Focus"), h("span", { class: "pill-target is-focus" }, "Підрозділ А")),
      h("div", { class: "compare__item" }, h("span", { class: "overline" }, "Selected"), h("span", { class: "pill-target pill-target--selected" }, "Підрозділ А")),
      h("div", { class: "compare__item" }, h("span", { class: "overline" }, "Selected + focus"), h("span", { class: "pill-target pill-target--selected is-focus" }, "Підрозділ А")),
    ),
    h(
      "div",
      { class: "row", style: `margin-top: ${cssVar("space-6")}` },
      h("button", { class: "btn btn--primary", type: "button" }, "Primary"),
      h("button", { class: "btn btn--secondary", type: "button" }, "Secondary"),
      h("button", { class: "btn btn--accent", type: "button" }, "Accent"),
      h("input", { class: "input", placeholder: "Поле для фокусу", "aria-label": "Поле для фокусу" }),
    ),
  );
}

function controlsSection() {
  const states = (variant) =>
    h(
      "div",
      { class: "row" },
      h("button", { class: `btn btn--${variant}`, type: "button" }, "Default"),
      h("button", { class: `btn btn--${variant} is-hover`, type: "button" }, "Hover"),
      h("button", { class: `btn btn--${variant} is-active`, type: "button" }, "Active"),
      h("button", { class: `btn btn--${variant}`, type: "button", disabled: "" }, "Disabled"),
    );

  const field = (label, attrs, hint, hintClass = "field__hint") =>
    h(
      "label",
      { class: "field" },
      h("span", { class: "field__label" }, label),
      h("input", { class: "input", ...attrs }),
      hint ? h("span", { class: hintClass }, hint) : null,
    );

  const message = (status, title, body) =>
    h(
      "div",
      { class: `message message--${status}`, role: status === "error" ? "alert" : "status" },
      h("span", { class: "message__title" }, title),
      h("span", { class: "message__body" }, body),
    );

  const nav = h(
    "nav",
    { class: "nav", "aria-label": "Приклад навігації" },
    h("a", { href: "#", "data-demo": "" }, "Огляд", h("span", { class: "muted" }, "12")),
    h("a", { href: "#", "data-demo": "", "aria-current": "page" }, "Донесення", h("span", null, "48")),
    h("a", { href: "#", "data-demo": "" }, "Підрозділи", h("span", { class: "muted" }, "7")),
    h("a", { href: "#", "data-demo": "" }, "Форми", h("span", { class: "muted" }, "3")),
  );

  const rows = [
    ["UNIT-0412", "Підрозділ А", "Активний", "1 204"],
    ["UNIT-0427", "Підрозділ Б", "Активний", "856"],
    ["UNIT-0433", "Підрозділ В", "Резерв", "312"],
    ["UNIT-0451", "Підрозділ Г", "Активний", "97"],
  ].map(([id, name, state, count]) => [h("code", null, id), name, h("span", { class: "muted" }, state), h("td", { class: "num" }, count)]);

  return section(
    "interface",
    "Приклади інтерфейсу",
    "Демонстрація токенів у типових ситуаціях, а не бібліотека компонентів. Рядок 2 — вибраний, рядок 3 показує hover.",
    h(
      "div",
      { class: "grid-2" },
      h(
        "div",
        null,
        h("p", { class: "overline" }, "Primary"),
        states("primary"),
        h("p", { class: "overline" }, "Secondary"),
        states("secondary"),
        h("p", { class: "overline" }, "Accent"),
        states("accent"),
        h("p", null, "Звичайний абзац робочого тексту з ", h("span", { class: "badge badge--accent" }, "Новий"), " акцентною міткою. ", h("span", { class: "muted" }, "Приглушений допоміжний текст.")),
      ),
      h(
        "div",
        { style: `display: grid; gap: ${cssVar("space-4")}` },
        field("Назва підрозділу", { value: "Підрозділ А" }, "Обов'язкове поле"),
        field("Позивний", { placeholder: "Введіть позивний", class: "input is-hover" }, "Стан hover"),
        field("Код форми", { value: "F-12", "aria-invalid": "true" }, "Код має містити 4 символи", "field__hint field__hint--error"),
        field("Архівне поле", { value: "Недоступно", disabled: "" }, "Неактивне поле"),
      ),
    ),
    h(
      "div",
      { class: "grid-2", style: `margin-top: ${cssVar("space-6")}` },
      nav,
      table(["ID", "Підрозділ", "Стан", "Записів"], rows, (index) =>
        index === 1 ? { "aria-selected": "true" } : index === 2 ? { class: "is-hover" } : null,
      ),
    ),
    h(
      "div",
      { class: "grid-2", style: `margin-top: ${cssVar("space-6")}` },
      message("success", "Збережено", "Форму донесення успішно надіслано."),
      message("warning", "Увага", "Дані підрозділу не оновлювалися понад 24 години."),
      message("error", "Помилка", "Не вдалося зберегти зміни. Перевірте поле «Код форми»."),
      message("info", "Довідка", "Нова версія шаблону доступна з 03.11.2026."),
    ),
  );
}

function sampleCell(result) {
  // Відтворюємо ті самі шари фону, що й валідатор, щоб зразок збігався з розрахунком.
  const [base, ...layers] = result.background;
  let inner = h("span", { class: "sample", style: `color: ${cssVar(result.foreground)}; border-color: transparent` }, "Aa");
  for (const layer of layers.reverse()) {
    inner = h("span", { style: `display: inline-block; background: ${cssVar(layer)}; border-radius: inherit` }, inner);
  }
  return h("span", { style: `display: inline-block; background: ${cssVar(base)}; border-radius: ${cssVar("radius-control")}` }, inner);
}

function contrastSection(report, theme) {
  // Звіт містить і контрольні палітри; preview показує активну.
  const own = report.results.filter((result) => result.theme === theme && result.palette === report.activePalette);
  const summary = report.summary[report.activePalette][theme];
  const rows = own.map((result) => [
    h("span", { class: "muted" }, result.group),
    h("span", null, result.label, result.note ? h("div", { class: "muted", style: `font: ${cssVar("font-caption")}` }, result.note) : null),
    sampleCell(result),
    h("code", null, `${result.foregroundHex} / ${result.backgroundHex}`),
    h("td", { class: "num mono" }, result.ratioText),
    h("td", { class: "num mono" }, result.threshold === null ? "—" : `${result.threshold}:1`),
    h("span", { class: `badge badge--${result.status}` }, result.status),
  ]);
  return section(
    "contrast",
    `WCAG contrast — ${theme}`,
    "Значення обчислено генератором (WCAG 2.2 relative luminance) і прочитано з generated/contrast-report.json. Напівпрозорі шари накладено на фактичний фон. Перевірка кольорів не означає повної WCAG-відповідності продукту.",
    h(
      "div",
      { class: "summary" },
      ...[
        ["Pass", summary.pass],
        ["Fail", summary.fail],
        ["Exempt", summary.exempt],
        ["Усього", summary.total],
      ].map(([label, value]) => h("div", null, h("p", { class: "overline" }, label), h("p", { class: "summary__value", style: "margin: 0" }, String(value)))),
    ),
    table(["Група", "Пара", "Зразок", "FG / BG", "Ratio", "Поріг", "Статус"], rows),
  );
}

function renderView(theme, tokens, report) {
  document.documentElement.dataset.theme = theme;
  for (const link of document.querySelectorAll("[data-theme-link]")) {
    if (link.getAttribute("data-theme-link") === theme) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }
  const view = document.getElementById("view");
  view.replaceChildren(
    h("h1", { class: "view-title" }, theme === "light" ? "Light" : "Dark"),
    h("p", { class: "view-lead" }, "Gray-first Military Modern. Сірий — основа, олива — вибір і основні дії, теракотовий — дозований акцент."),
    primitivesSection(tokens),
    semanticSection(tokens, theme),
    typographySection(tokens),
    spacingSection(tokens),
    radiusSection(tokens),
    elevationSection(tokens),
    focusSection(),
    controlsSection(),
    contrastSection(report, theme),
  );
  for (const link of view.querySelectorAll("[data-demo]")) {
    link.addEventListener("click", (event) => event.preventDefault());
  }
}

function currentTheme() {
  const fromHash = location.hash.slice(1);
  if (themesList.includes(fromHash)) return fromHash;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

async function main() {
  const [tokens, report] = await Promise.all([
    fetch("/generated/tokens.json").then((response) => response.json()),
    fetch("/generated/contrast-report.json").then((response) => response.json()),
  ]);
  renderView(currentTheme(), tokens, report);
  addEventListener("hashchange", () => renderView(currentTheme(), tokens, report));
}

main().catch((error) => {
  document.getElementById("view").replaceChildren(h("p", { role: "alert" }, `Не вдалося завантажити токени: ${error.message}`));
});
