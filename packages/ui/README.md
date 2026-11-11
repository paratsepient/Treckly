# @index/ui — Controls v1

Базові UI-примітиви IndeX на React 19. Стилі — лише семантичні токени
`@index/design-tokens`; однакова геометрія й поведінка в Light і Dark.

## Компоненти

| Компонент | Основа | Стани | Клавіатура / ARIA |
| --- | --- | --- | --- |
| `Button` | `<button>`; варіанти secondary, primary, accent (контурна: теракотові текст і контур без заливки), destructive, ghost | default, hover, active, focus-visible, disabled, loading | `type="button"` за замовчуванням; loading → `aria-busy`, `aria-disabled`, фокус зберігається, кліки й submit ігноруються |
| `IconButton` | `Button` + `Tooltip` | ті самі | `label` обов'язковий (`aria-label`), підказка з назвою не дублюється в `aria-describedby` |
| `Input` | `<input>` | default, hover, focus-visible, readonly, error, disabled | `<label for>`, `aria-describedby` (опис + помилка), `aria-invalid` |
| `Textarea` | `<textarea>` | ті самі | те саме; змінює розмір лише по вертикалі |
| `Select` | нативний `<select>`; відкритий список у стилі токенів через `appearance: base-select` (Chromium), інакше системний | default, hover, focus-visible, error, disabled, placeholder | клавіатура, пошук і мобільні пікери — від браузера |
| `Checkbox` | `<input type="checkbox">` | unchecked, checked, indeterminate, hover, focus-visible, error, disabled | Space; `indeterminate` як DOM-властивість |
| `Switch` | `<input type="checkbox" role="switch">` | off, on, hover, focus-visible, disabled | Space; стан як `aria-checked` |
| `SegmentedControl` | `<fieldset>` + нативні radio | вибраний, hover, focus-visible, disabled | стрілки й одна Tab-зупинка від браузера; піднятий індикатор рухається `transform` |
| `RadioGroup` / `Radio` | `<fieldset>` + `<legend>` + `<input type="radio">` | checked, hover, focus-visible, error, disabled | стрілки й одна Tab-зупинка — від браузера |
| `Tabs` / `TabList` / `Tab` / `TabPanel` | WAI-ARIA Tabs | selected, hover, focus-visible, disabled | ←/→, Home/End, roving tabindex, `automatic` або `manual` активація |
| `ScrollArea` | нативний `overflow` + власна смуга | focus-visible, hover/перетягування повзунка | `role="region"` + `aria-label`, `tabIndex=0`; без перехоплення wheel/touch. Нативна смуга прихована; власна (жолоб `--ix-scrollbar-track` + опуклий повзунок) стоїть поруч з областю, поза її рамкою: `className` — місце в розкладці, `viewportClassName` — відступи й рамка вмісту. Повзунок тягнеться, клік по жолобу — сторінка. `scrollbar="hidden"` прибирає смугу (колонка навігації). `variant="well"` — область-лунка, як поле вводу (заглиблене тло, `--ix-shadow-inset`, межа лунки), для журналів і переліків у рамці. Смуга `aria-hidden` |
| `Tooltip` | обгортка тригера | hidden, open | hover із затримкою або клавіатурний фокус; Escape; WCAG 1.4.13; бік `top`/`bottom`/`left`/`right` з переворотом |
| `Popover` | тригер + портал `role="dialog"` (немодальний) | closed, open | `aria-expanded`/`aria-controls`/`aria-haspopup="dialog"`; фокус у панель; Escape повертає фокус на тригер; Tab з останнього елемента веде після тригера, Shift+Tab з першого — на тригер; клік поза панеллю закриває |
| `Menu` | тригер + портал `role="menu"` | closed, open; пункт hover, focus-visible, disabled, destructive | APG Menu Button: ↓/↑ на тригері, стрілки, Home/End, перша літера, Enter/Space, Escape; Tab закриває й веде до елемента після тригера, Shift+Tab — на тригер |
| `Card` | `<section>` (з `title` — `aria-labelledby`) | raised, flat, selected | дії в куті (без заголовка — поверх вмісту), footer для позначок результату |
| `Badge` | `<span>` | neutral, success, warning, error, info | текст завжди видимий, іконка декоративна |
| `DataState` | блок або рядок | loading, empty, incomplete, unavailable, stale, denied, error | loading — `role="status"` + `aria-busy`; error/unavailable — `role="alert"`; решта статичні |
| `DataTable` | `<table>` у `ScrollArea` | sticky header, sort, current row, стан даних | `caption`, `th scope`, `aria-sort`, кнопка сортування, вибір рядка кнопкою в заголовку рядка (`aria-pressed`), `aria-current` на рядку |
| `GraphCanvas` / `GraphNode` / `GraphFrame` | полотно з SVG-шаром | нода: selected, статус; порт: connected, invalid; ребро: default, selected, invalid, pending | заголовок ноди — кнопка вибору (`aria-pressed`); порти — переліки «Входи»/«Виходи» зі станом для зчитувача; фрейм — `role="group"` |

Кожен вид має один канонічний компонент; тест фіксує склад публічного API.
`SegmentedControl` не дублює Tabs: це вибір значення (radiogroup, участь у формі), а Tabs
перемикає панелі (tablist ↔ tabpanel). `Icon` — двоколірні лінійні іконки IndeX (сітка 24, лінія 1.5 px, заокруглені кінці): контур — колір тексту (`currentColor`), виразний елемент — `--ix-icon-accent` (тон теракоти, що тримає 3:1 на всіх поверхнях і гранях вторинних кнопок), як в емблемі. `<Icon name="add" />` за замовчуванням декоративна; `title` робить її зображенням із назвою. Розміри 16 / 20 / 24; повний перелік — `iconNames` і галерея в Playground (розділ «Іконки»).
На заповнених кнопках (primary, accent, destructive), у вимкненому стані й у Windows High Contrast іконка одноколірна: контейнер задає `--icon-accent: currentColor`. «Закрити» і «Фільтр» одноколірні навмисно. Шари: зверху контур (для вістря стрілок, кришки, повзунків, точок згину й портів — акцент, `accentOnTop`), а нижній шар маскою обривається під верхнім з проміжком 1.25, тож кольори ніде не торкаються. Тест набору перевіряє, що лінії лишаються в полі 1–23, акцент не лягає на контур, а деталі не стоять ближче проміжку 0.9 (на 16 px злипаються); навмисні з'єднання біля кінців ліній і перетини дозволені.

`DonutChart` і `PieChart` — частини одного цілого (до 6 частин, решта згортається в «Інше»). `scheme="categorical"` присвоює слоти `--ix-chart-1…6` за порядком (палітра даних валідована dataviz для обох тем, з пом'якшенням контрасту через легенду й таблицю); `scheme="diverging"` — шкала згоди за `tone` (тепле плече clay ↔ нейтральний графіт ↔ холодне steel). Легенда з частками завжди поруч, підказка при наведенні, таблиця для зчитувача; у пончика сума в центрі.

`BarChart` — порівняння величин однієї серії від нуля: `orientation="vertical"` (стовпчики: періоди, короткі назви) або `"horizontal"` (смуги: довгі назви, рейтинги). Товщина ≤ 24 px, 4 px заокруглення на кінці зі значенням, основа пряма; сітка — волосяні лінії, поділки — круглі числа (від 10 000 — скорочено). Значення підписане біля найбільшого стовпчика або того, на який наведено чи який вибрано; наведення й клік штрихують решту, як у пончика. Легенди немає (одна серія — її називає `title`); таблиця для зчитувача з `valueLabel`.

`KpiTile` — показник: `label`, `value` (від 10 000 — скорочено), `unit`, `delta` (зміна зі знаком до названого `period`; колір — напрям × `goodWhen`: «up» для кількостей, «down» для часу реагування; статусна плашка зі стрілкою й словом для зчитувача) і `trend` (до 12 періодів, приглушена лінія, поточний — точка кольору серії). Рамку картки задає місце використання.

`Emblem` — емблема IndeX у кольорах теми: лацкани — `--ix-accent`, контур і шестерня — `--ix-foreground`; `decorative` ховає її від зчитувача, коли поруч є назва текстом. Розмір — висотою через `className` (за замовчуванням `--ix-space-8`).

`Card` — єдиний контейнер віджетів дашборду, розділів сторінки й груп (рівень card: `surface-raised`, контур `--ix-border`, `--ix-shadow-card`; `variant="flat"` — рівень 0 без тіні). Вибір — контур кольору `--ix-selection-indicator` і внутрішнє кільце 1 px (та сама мова, що в ноди графа). Картка не є кнопкою: у ній лежать діаграми й контроли.

`DataState` — стани даних із PRODUCT.md: збій, відсутність доступу, застарілі чи неповні дані — явний стан з іконкою й текстом, не нуль і не зниклий віджет. `size="compact"` — рядок для віджета чи клітинки. `Badge` — позначка стану в рядку (статус запису, «Застаріло», «Вибірка»); пара текст/тло — `status`/`status-surface`.

`DataTable` — нативна таблиця в `ScrollArea` (прокрутка в обидва боки, липкий заголовок). Плоский рівень 0: волосяні лінії, без тіні. Таблиця не сортує сама — `sort`/`onSortChange` належать власнику даних. Поточний рядок — тло вибору й смуга 4 px, як у списках. `state` замінює рядки на `DataState`, заголовки лишаються.

Граф (`GraphCanvas`, `GraphNode`, `GraphFrame`) — візуальні примітиви редактора за ADR-GRAPH-001: ноди з іконкою типу, входи ліворуч і виходи праворуч (сокет — лунка на контурі, під'єднаний — заповнений, невалідний — кільце помилки), явний статус ноди («Немає джерела»), Frame — лише візуальна група (пунктир, без тла). Ребра Output → Input будуються з фактичного положення сокетів у DOM (`data-graph-port`), тож геометрія нод не дублюється константами; невалідне ребро — пунктир і колір помилки. Pan/zoom, перетягування й створення ребер — окремий шар Shared Canvas (ще не реалізований).

`Popover` і `Menu` рендеряться порталом з `position: fixed` (як Tooltip) на спільному розрахунку позиції `computeFloatingPosition` (бік, вирівнювання, переворот, притискання до країв viewport); у відкритому `<dialog>` — у сам діалог.

Вигляд Tabs за замовчуванням — `TabList variant="folder"` (вкладки-«папки»: вибрана зливається з панеллю вмісту, решта — компактні пігулки; у фокусі світиться вся папка одним SVG-контуром вкладки, вигинів і панелі — один шар без швів, розміри й колір з токенів `--ix-focus-glow-*`, `--ix-focus-pulse-*`); є також візуальні варіанти `variant="line"` (підкреслення) і `variant="segmented"` (піднята вкладка в треку).

## Підключення

```css
@import "@index/ui/styles.css";
```

`styles.css` уже імпортує `@index/design-tokens/tokens.css` (разом із локальним Inter).

```tsx
import { Button, Input } from "@index/ui";

<Input label="Позивний" error={error} />
<Button variant="primary" loading={saving}>Зберегти</Button>
```

## Правила кольору

- **Нейтральні за замовчуванням**: `Button` — `secondary`, `IconButton` — `ghost`.
- **Олива** (`action-primary`, `selection-*`) — одна пріоритетна дія на екрані,
  вибір (checked, вибрана вкладка, увімкнений Switch).
- **Помаранчевий**: `accent` — лише свідомо виділена дія; `focus-ring` — фокус.
- **Червоний**: `destructive` — небезпечні дії (токени `action-destructive*` на шкалі
  error). Помаранчевий акцент для небезпечних дій не використовується.
- Межі контролів — `border-strong` (≥ 3:1). `border` дозволено тільки для
  роздільника вкладок і контуру Tooltip — це перевіряє тест.
- Фокус — завжди контур `--ix-focus-ring`, ніколи заливка; вибір — завжди
  заливка або індикатор `--ix-selection-indicator`.

## Команди

```bash
pnpm --filter @index/ui check
```

```bash
pnpm --filter @index/ui playground
```

- `check` — typecheck, тести (поведінка, axe-core, архітектура) і збірка Playground.
- `playground` — http://localhost:4320/ (`PORT` змінює порт). Перемикач
  Light / Dark / Обидві; матриці станів кожного компонента та живі екземпляри.

Клас `.ix-sr-only` (візуально прихований текст) — публічна утиліта стилів пакета;
її використовують `@index/ui-patterns` замість власної копії.

Стани hover/active/focus у матрицях показуються атрибутом `data-ix-preview`.
Він потрібен лише Playground і візуальним перевіркам; у продукті не використовується.

## Тести

- **Поведінка** (`tests/*.test.tsx`, jsdom + React `act`): клавіатура Tabs,
  loading/disabled у Button, зв'язки мітки/опису/помилки, indeterminate,
  контрольовані RadioGroup і Tabs, показ і закриття Tooltip.
- **Доступність**: axe-core для всіх компонентів у всіх основних станах
  (правило `color-contrast` вимкнено — jsdom не рендерить; контраст перевіряє
  валідатор `@index/design-tokens`), перевірка доступних назв.
- **Архітектура**: лише оголошені не-примітивні токени, жодних літералів кольору,
  межі контролів через `border-strong`, `focus-visible` у кожного контрола,
  без `overscroll-behavior: contain/none`, reduced motion, дозволені імпорти,
  `"use client"`, склад API.

## Обмеження

- Tooltip, Popover і Menu рендеряться порталом (`position: fixed`) з переворотом на
  протилежний бік і притисканням до країв viewport; у відкритому `<dialog>` — порталом у сам діалог.
- Режим високої контрастності (`forced-colors`): вибрані стани, що трималися на тлі й тіні (рядок таблиці,
  картка, нода, вкладка, сегмент, перемикачі), дублюються системним кольором `Highlight`.
- Textarea і відкритий список Select прокручуються нативно (ScrollArea всередину поля не вкласти);
  смуга фарбується тими самими токенами (`scrollbar-color`), але форма повзунка — системна.
  Escape у Drawer закриває і підказку, і Drawer (поведінка нативного `<dialog>`).
- Нативний список `Select` малює браузер; кольори пунктів задаються лише там,
  де браузер це дозволяє (через `color-scheme` теми).
- Перевірки поведінки виконуються в jsdom. Нативна клавіатура радіокнопок
  і select у jsdom не моделюється; її перевірено вручну в Chromium.
- Не перевірено зі зчитувачами екрана (NVDA, JAWS, VoiceOver) та у Firefox/Safari.
