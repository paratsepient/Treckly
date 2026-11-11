/**
 * Controls Playground. Кожен компонент показано у двох темах і в усіх станах.
 * Стани hover/active/focus без взаємодії показуються атрибутом data-ix-preview;
 * поруч завжди є «живий» екземпляр для реальної перевірки мишею й клавіатурою.
 */
import "../src/styles.css";
import "./playground.css";
import { StrictMode, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Badge,
  BarChart,
  Button,
  Card,
  Checkbox,
  DataState,
  DataTable,
  DonutChart,
  GraphCanvas,
  GraphFrame,
  GraphNode,
  Emblem,
  Icon,
  IconButton,
  Input,
  KpiTile,
  Menu,
  PieChart,
  Popover,
  Radio,
  RadioGroup,
  ScrollArea,
  SegmentedControl,
  Select,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
  Tooltip,
  type ButtonVariant,
  type DataStateKind,
  type GraphLayoutChange,
  type GraphPoint,
  type IconName,
  type TableSort,
} from "../src/index.ts";

type Mode = "light" | "dark" | "both";
type Preview = "hover" | "active" | "focus";

const icons = {
  settings: <Icon name="settings" />,
  widgetSettings: <Icon name="widget-settings" />,
  plus: <Icon name="add" />,
  trash: <Icon name="delete" />,
  filter: <Icon name="filter" />,
};

const preview = (state: Preview | undefined): Record<string, string> => (state ? { "data-ix-preview": state } : {});

function Section({ title, note, children }: { readonly title: string; readonly note?: string; readonly children: ReactNode }) {
  return (
    <section className="pg-section" aria-label={title}>
      <h2 className="pg-section__title">{title}</h2>
      {note ? <p className="pg-section__note">{note}</p> : null}
      {children}
    </section>
  );
}

function Matrix({ columns, rows }: { readonly columns: readonly string[]; readonly rows: ReadonlyArray<{ label: string; cells: readonly ReactNode[] }> }) {
  return (
    <div className="pg-matrix" style={{ "--pg-columns": columns.length } as CSSProperties}>
      <span />
      {columns.map((column) => (
        <span key={column} className="pg-overline">
          {column}
        </span>
      ))}
      {rows.map((row) => [
        <span key={`${row.label}-label`} className="pg-muted">
          {row.label}
        </span>,
        ...row.cells.map((cell, index) => <div key={`${row.label}-${columns[index]}`}>{cell}</div>),
      ])}
    </div>
  );
}

function Cell({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="pg-cell">
      <p className="pg-overline">{title}</p>
      {children}
    </div>
  );
}

function ButtonsSection() {
  const variants: ButtonVariant[] = ["secondary", "primary", "accent", "destructive", "ghost"];
  const columns = ["Default", "Hover", "Active", "Focus", "Disabled", "Loading"];
  const [saving, setSaving] = useState(false);

  return (
    <Section
      title="Button"
      note="Secondary — нейтральний варіант за замовчуванням. Primary (олива) — одна пріоритетна дія екрана, Accent (теракотовий) — дозовано. Destructive — червона шкала error для небезпечних дій. Loading лишає кнопку у фокусі й ігнорує кліки."
    >
      <Matrix
        columns={columns}
        rows={variants.map((variant) => ({
          label: variant,
          cells: [
            <Button variant={variant}>Зберегти</Button>,
            <Button variant={variant} {...preview("hover")}>
              Зберегти
            </Button>,
            <Button variant={variant} {...preview("active")}>
              Зберегти
            </Button>,
            <Button variant={variant} {...preview("focus")}>
              Зберегти
            </Button>,
            <Button variant={variant} disabled>
              Зберегти
            </Button>,
            <Button variant={variant} loading>
              Зберегти
            </Button>,
          ],
        }))}
      />
      <p className="pg-overline" style={{ marginTop: "var(--ix-space-4)" }}>
        Живий екземпляр
      </p>
      <div className="pg-row">
        <Button variant="primary" iconStart={icons.plus} loading={saving} onClick={() => {
          setSaving(true);
          setTimeout(() => setSaving(false), 1500);
        }}>
          Створити донесення
        </Button>
        <Button iconEnd={icons.filter}>Фільтр</Button>
        <Button variant="ghost">Скасувати</Button>
        <Button variant="destructive" iconStart={icons.trash}>
          Видалити шаблон
        </Button>
      </div>
    </Section>
  );
}

function IconButtonsSection() {
  const columns = ["Default", "Hover", "Active", "Focus", "Disabled", "Loading"];
  return (
    <Section title="IconButton" note="Назва обов'язкова (aria-label) і показується підказкою при наведенні та клавіатурному фокусі. За замовчуванням ghost.">
      <Matrix
        columns={columns}
        rows={(["ghost", "secondary"] as const).map((variant) => ({
          label: variant,
          cells: [
            <IconButton variant={variant} label="Налаштування" icon={icons.settings} />,
            <IconButton variant={variant} label="Налаштування" icon={icons.settings} {...preview("hover")} />,
            <IconButton variant={variant} label="Налаштування" icon={icons.settings} {...preview("active")} />,
            <IconButton variant={variant} label="Налаштування" icon={icons.settings} {...preview("focus")} />,
            <IconButton variant={variant} label="Видалити" icon={icons.trash} disabled />,
            <IconButton variant={variant} label="Оновлення" icon={icons.settings} loading />,
          ],
        }))}
      />
    </Section>
  );
}

function FieldsSection() {
  const [code, setCode] = useState("F-12");
  const codeError = /^F-\d{4}$/.test(code) ? undefined : "Формат: F-0000";
  return (
    <Section title="Input / Textarea" note="Мітка обов'язкова. readOnly — для значень, які треба прочитати; disabled — лише для недоступних полів.">
      <div className="pg-grid">
        <Cell title="Default">
          <Input label="Назва підрозділу" placeholder="Наприклад, Підрозділ А" />
        </Cell>
        <Cell title="Hover">
          <Input label="Позивний" placeholder="Введіть позивний" {...preview("hover")} />
        </Cell>
        <Cell title="Focus">
          <Input label="Координати" defaultValue="50.4501, 30.5234" {...preview("focus")} />
        </Cell>
        <Cell title="Required + опис">
          <Input label="Відповідальний" required description="Прізвище та ініціали" />
        </Cell>
        <Cell title="Error (живе)">
          <Input label="Код форми" value={code} onChange={(event) => setCode(event.target.value)} error={codeError} description="Чотири цифри після F-" />
        </Cell>
        <Cell title="Read-only">
          <Input label="Ідентифікатор" readOnly value="UNIT-0427" />
        </Cell>
        <Cell title="Disabled">
          <Input label="Архівне поле" disabled value="Недоступно" />
        </Cell>
        <Cell title="Hidden label">
          <Input label="Пошук" hideLabel type="search" placeholder="Пошук за назвою" />
        </Cell>
        <Cell title="Textarea">
          <Textarea label="Коментар" description="До 500 символів" />
        </Cell>
        <Cell title="Textarea error">
          <Textarea label="Причина" error="Обов'язкове поле" required />
        </Cell>
        <Cell title="Textarea disabled">
          <Textarea label="Нотатка" disabled defaultValue="Редагування закрито" />
        </Cell>
      </div>
    </Section>
  );
}

function SelectSection() {
  const options = (
    <>
      <option value="a">Підрозділ А</option>
      <option value="b">Підрозділ Б</option>
      <option value="c">Підрозділ В</option>
    </>
  );
  return (
    <Section title="Select" note="Нативний select: клавіатура, пошук за літерою і мобільні пікери — від браузера. Стилізоване лише закрите поле.">
      <div className="pg-grid">
        <Cell title="Placeholder">
          <Select label="Підрозділ" placeholder="Оберіть підрозділ" required>
            {options}
          </Select>
        </Cell>
        <Cell title="Hover">
          <Select label="Підрозділ" defaultValue="a" {...preview("hover")}>
            {options}
          </Select>
        </Cell>
        <Cell title="Focus">
          <Select label="Підрозділ" defaultValue="b" {...preview("focus")}>
            {options}
          </Select>
        </Cell>
        <Cell title="Error">
          <Select label="Підрозділ" placeholder="Оберіть" error="Оберіть підрозділ">
            {options}
          </Select>
        </Cell>
        <Cell title="Disabled">
          <Select label="Підрозділ" defaultValue="c" disabled>
            {options}
          </Select>
        </Cell>
      </div>
    </Section>
  );
}

function ChoiceSection() {
  const [all, setAll] = useState<boolean[]>([true, false, true]);
  const checkedCount = all.filter(Boolean).length;
  return (
    <Section title="Checkbox / Switch / Radio" note="Нативні input із власним малюнком. Checkbox — вибір із застосуванням пізніше; Switch — миттєва дія.">
      <div className="pg-grid">
        <Cell title="Checkbox">
          <Checkbox label="Unchecked" />
          <Checkbox label="Checked" defaultChecked />
          <Checkbox label="Indeterminate" indeterminate />
          <Checkbox label="Hover" {...preview("hover")} />
          <Checkbox label="Focus" {...preview("focus")} />
          <Checkbox label="Error" error="Потрібне підтвердження" />
          <Checkbox label="Disabled" disabled />
          <Checkbox label="Disabled checked" disabled defaultChecked />
        </Cell>
        <Cell title="Checkbox «вибрати всі» (живий)">
          <Checkbox
            label="Усі підрозділи"
            checked={checkedCount === all.length}
            indeterminate={checkedCount > 0 && checkedCount < all.length}
            onChange={(event) => setAll(all.map(() => event.target.checked))}
          />
          {["А", "Б", "В"].map((name, index) => (
            <Checkbox
              key={name}
              label={`Підрозділ ${name}`}
              checked={all[index] ?? false}
              onChange={(event) => setAll(all.map((value, position) => (position === index ? event.target.checked : value)))}
            />
          ))}
        </Cell>
        <Cell title="Switch">
          <Switch label="Off" />
          <Switch label="On" defaultChecked />
          <Switch label="Hover" {...preview("hover")} />
          <Switch label="Focus" {...preview("focus")} />
          <Switch label="Disabled off" disabled />
          <Switch label="Disabled on" disabled defaultChecked description="Керується адміністратором" />
        </Cell>
        <Cell title="Radio">
          <RadioGroup label="Пріоритет" defaultValue="normal">
            <Radio value="low" label="Низький" />
            <Radio value="normal" label="Звичайний" />
            <Radio value="high" label="Високий" description="Сповіщає чергового" />
            <Radio value="off" label="Вимкнено" disabled />
          </RadioGroup>
          <RadioGroup label="Канал (помилка)" error="Оберіть канал" required>
            <Radio value="radio" label="Радіо" />
            <Radio value="cable" label="Дротовий" />
          </RadioGroup>
        </Cell>
      </div>
    </Section>
  );
}

function TabsSection() {
  const [value, setValue] = useState("overview");
  return (
    <Section title="Tabs" note="Стрілки ←/→ переміщують фокус (і вибір у режимі automatic), Home/End — до крайніх; неактивна вкладка пропускається. За замовчуванням — «папки»: вибрана вкладка зливається з панеллю.">
      <p className="pg-overline">Automatic</p>
      <Tabs value={value} onValueChange={setValue}>
        <TabList aria-label="Розділи підрозділу">
          <Tab value="overview">Огляд</Tab>
          <Tab value="reports">Донесення</Tab>
          <Tab value="archive" disabled>
            Архів
          </Tab>
          <Tab value="settings">Налаштування</Tab>
        </TabList>
        <TabPanel value="overview">Огляд стану підрозділу.</TabPanel>
        <TabPanel value="reports">48 донесень за добу.</TabPanel>
        <TabPanel value="archive">Архів недоступний.</TabPanel>
        <TabPanel value="settings">Параметри сповіщень.</TabPanel>
      </Tabs>
      <p className="pg-status">value = {value}</p>
      <p className="pg-overline" style={{ marginTop: "var(--ix-space-4)" }}>
        Manual · примусові стани hover і focus
      </p>
      <Tabs defaultValue="a" activation="manual">
        <TabList aria-label="Демонстрація станів">
          <Tab value="a">Вибрана</Tab>
          <Tab value="b" {...preview("hover")}>
            Hover
          </Tab>
          <Tab value="c" {...preview("focus")}>
            Focus
          </Tab>
          <Tab value="d" disabled>
            Disabled
          </Tab>
        </TabList>
        <TabPanel value="a">Панель A. Enter/Space вибирає вкладку у фокусі.</TabPanel>
        <TabPanel value="b">Панель B.</TabPanel>
        <TabPanel value="c">Панель C.</TabPanel>
        <TabPanel value="d">Панель D.</TabPanel>
      </Tabs>
    </Section>
  );
}

const iconGroups: readonly (readonly [string, readonly (readonly [IconName, string])[]])[] = [
  ["Навігація", [
    ["org-structure", "Структура організації"], ["org-graph", "Організаційний граф"], ["templates", "Шаблони"],
    ["unit-workspace", "Робочий простір підрозділу"], ["registry", "Реєстр / форми"], ["user-profile", "Профіль користувача"], ["users", "Користувачі"], ["role", "Роль і права"],
    ["logout", "Вихід"], ["menu", "Меню"], ["sidebar", "Згорнути бічну панель"], ["sidebar-expand", "Розгорнути бічну панель"],
    ["panel-start", "Панель контексту"], ["panel-end", "Панель інспектора"], ["theme-light", "Світла тема"], ["theme-dark", "Темна тема"],
    ["back", "Назад"], ["forward", "Вперед"], ["move-up", "Перемістити вгору"], ["move-down", "Перемістити вниз"],
    ["expand", "Розгорнути"], ["collapse", "Згорнути"],
  ]],
  ["Основні дії", [
    ["add", "Додати"], ["edit", "Редагувати"], ["rename", "Перейменувати"], ["delete", "Видалити"], ["close", "Закрити"],
    ["save", "Зберегти"], ["duplicate", "Дублювати"], ["archive", "Архівувати"], ["restore", "Відновити з архіву"], ["settings", "Налаштування"],
    ["share", "Надати доступ"], ["search", "Пошук"], ["filter", "Фільтр"],
    ["filter-reset", "Скинути фільтр"], ["refresh", "Оновити"], ["view", "Переглянути"], ["drag", "Перетягнути"], ["more", "Більше дій"],
    ["sort", "Не сортовано"], ["sort-ascending", "За зростанням"], ["sort-descending", "За спаданням"],
  ]],
  ["Типи нод", [
    ["node-unit", "Підрозділ"], ["node-form", "Форма / реєстр"], ["node-dashboard", "Дашборд"], ["group-input", "Вхід підрозділу"],
    ["group-output", "Вихід підрозділу"], ["separate", "Розділення"], ["filter-node", "Фільтр"], ["merge", "Об’єднання"],
    ["merge-append", "Об’єднання: Append"], ["merge-join", "Об’єднання: Join"],
  ]],
  ["Дії в графі", [
    ["connect", "З’єднати порти"], ["disconnect", "Розірвати зв’язок"], ["add-bend", "Додати згин"], ["remove-bend", "Прибрати згин"],
    ["frame", "Створити фрейм"], ["align-vertical", "Вирівняти по вертикалі"], ["align-horizontal", "Вирівняти по горизонталі"],
    ["zoom-in", "Збільшити"], ["zoom-out", "Зменшити"], ["fit-view", "Вписати у вікно"], ["undo", "Скасувати"], ["redo", "Повторити"],
    ["node-toggle", "Активувати ноду"],
  ]],
  ["Форми та реєстри", [
    ["document", "Документ / форма"], ["sheet", "Аркуш"], ["sheet-add", "Додати аркуш"], ["sheet-rename", "Перейменувати аркуш"],
    ["sheet-delete", "Видалити аркуш"], ["records", "Список записів"], ["field-required", "Обов’язкове поле"],
    ["field-locked", "Заблоковане поле"], ["field-local", "Локальне поле"], ["data-input", "Вхідні дані"], ["calendar", "Дата / період"], ["history", "Історія версій"],
  ]],
  ["Дашборди", [
    ["kpi", "KPI"], ["bar-chart", "Стовпчикова діаграма"], ["donut-chart", "Кільцева діаграма"], ["data-source", "Джерело даних"],
    ["widget-library", "Бібліотека віджетів"], ["widget-settings", "Налаштування віджета"], ["calculation", "Як розраховано?"],
    ["trend-up", "Зростання"], ["trend-down", "Спад"], ["trend-flat", "Без змін"],
  ]],
  ["Стани", [
    ["success", "Успіх"], ["warning", "Попередження"], ["error", "Помилка"], ["info", "Інформація"], ["loading", "Завантаження"],
    ["empty", "Порожній стан"], ["stale", "Застарілі дані"], ["access-denied", "Немає доступу"], ["source-unavailable", "Джерело недоступне"],
  ]],
];

function IconsSection() {
  return (
    <Section title="Іконки" note="Лінія 1.5 px на сітці 24, два кольори як в емблемі: контур — колір тексту, виразний елемент — акцент теми. Розміри 16 / 20 / 24.">
      {iconGroups.map(([group, items]) => (
        <div key={group}>
          <p className="pg-overline">{group}</p>
          <div className="pg-icons">
            {items.map(([name, label]) => (
              <figure key={name} className="pg-icon">
                <Icon name={name} size={24} />
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
      <p className="pg-overline">Розміри 16 · 20 · 24</p>
      <div className="pg-row">
        {([16, 20, 24] as const).map((size) => (
          <Icon key={size} name="org-structure" size={size} />
        ))}
      </div>
    </Section>
  );
}

function ChartsSection() {
  return (
    <Section
      title="Діаграми · пончик і пиріг"
      note="Частини одного цілого з першого погляду, до 6 частин (решта — «Інше»). Легенда з частками завжди поруч, підказка при наведенні, таблиця для зчитувача. Для порівняння близьких значень краще стовпчики."
    >
      <div className="pg-grid">
        <Cell title="Donut · розбіжна шкала згоди">
          <DonutChart
            title="Чи зручна нова форма донесення?"
            scheme="diverging"
            centerLabel="відповідей"
            data={[
              { label: "Повністю згоден", value: 15, tone: "positive-3" },
              { label: "Згоден", value: 30, tone: "positive-2" },
              { label: "Нейтрально", value: 29, tone: "neutral" },
              { label: "Не згоден", value: 17, tone: "negative-2" },
              { label: "Зовсім не згоден", value: 8, tone: "negative-3" },
              { label: "Не знаю", value: 1, tone: "other" },
            ]}
          />
        </Cell>
        <Cell title="Pie · категорії">
          <PieChart
            title="Донесення за типом"
            data={[
              { label: "Обстановка", value: 42 },
              { label: "Логістика", value: 27 },
              { label: "Зв'язок", value: 18 },
              { label: "Медицина", value: 9 },
              { label: "Кадри", value: 6 },
              { label: "Техніка", value: 4 },
              { label: "Інфраструктура", value: 3 },
            ]}
          />
        </Cell>
      </div>
    </Section>
  );
}

function KpiBarSection() {
  return (
    <Section
      title="KPI і стовпчики"
      note="KPI — назва, значення, зміна до названого періоду (колір — напрям × що добре для показника) і тренд за 12 періодів. Стовпчики — одна серія від нуля: вертикальні для періодів і коротких назв, горизонтальні для довгих назв і рейтингів. Значення підписане біля найбільшого стовпчика; наведення й клік штрихують решту."
    >
      <div className="pg-kpis">
        <KpiTile
          label="Донесень за тиждень"
          value={1284}
          delta={{ value: 12, period: "до минулого тижня", format: (n) => `${n > 0 ? "+" : ""}${n} %` }}
          trend={[820, 910, 870, 990, 1040, 980, 1100, 1120, 1080, 1190, 1150, 1284]}
        />
        <KpiTile
          label="Середній час реагування"
          value={14}
          unit="хв"
          delta={{ value: 3, period: "до минулого тижня", goodWhen: "down", format: (n) => `${n > 0 ? "+" : ""}${n} хв` }}
          trend={[11, 12, 10, 11, 12, 13, 11, 12, 13, 12, 11, 14]}
        />
        <KpiTile label="Записів у реєстрі" value={128450} delta={{ value: 0, period: "за добу" }} />
      </div>
      <div className="pg-grid">
        <Cell title="Bar · вертикальний">
          <BarChart
            title="Донесення за днями"
            valueLabel="Донесень"
            data={[
              { label: "Пн", value: 184 },
              { label: "Вт", value: 212 },
              { label: "Ср", value: 197 },
              { label: "Чт", value: 241 },
              { label: "Пт", value: 226 },
              { label: "Сб", value: 118 },
              { label: "Нд", value: 106 },
            ]}
          />
        </Cell>
        <Cell title="Bar · горизонтальний">
          <BarChart
            title="Донесення за підрозділами"
            orientation="horizontal"
            valueLabel="Донесень"
            data={[
              { label: "1-й механізований батальйон", value: 312 },
              { label: "2-й механізований батальйон", value: 274 },
              { label: "Артилерійський дивізіон", value: 198 },
              { label: "Розвідувальна рота", value: 143 },
              { label: "Рота зв’язку", value: 87 },
            ]}
          />
        </Cell>
      </div>
    </Section>
  );
}

function ScrollSection() {
  return (
    <Section title="ScrollArea" note="Нативна прокрутка без пасток: після кінця області прокрутка переходить до сторінки. Область фокусується Tab і прокручується стрілками/PageDown.">
      <div className="pg-grid">
        <Cell title="Vertical">
          <ScrollArea label="Журнал подій" maxHeight="180px" variant="well">
            {Array.from({ length: 30 }, (_, index) => (
              <p key={index} className="pg-log-line">
                {`14:${String(index).padStart(2, "0")} UNIT-04${String(index % 9)}7 Донесення прийнято`}
              </p>
            ))}
          </ScrollArea>
        </Cell>
        <Cell title="Horizontal">
          <ScrollArea label="Перелік підрозділів" orientation="horizontal" variant="well">
            <div className="pg-wide">
              {Array.from({ length: 14 }, (_, index) => (
                <span key={index} className="pg-chip">{`Підрозділ ${index + 1}`}</span>
              ))}
            </div>
          </ScrollArea>
        </Cell>
        <Cell title="Focus">
          <ScrollArea label="Демонстрація фокуса" maxHeight="96px" variant="well" {...preview("focus")}>
            {Array.from({ length: 8 }, (_, index) => (
              <p key={index} className="pg-log-line">{`Рядок ${index + 1}`}</p>
            ))}
          </ScrollArea>
        </Cell>
      </div>
    </Section>
  );
}

function TooltipSection() {
  return (
    <Section title="Tooltip" note="Показ: наведення (затримка 400 мс) або клавіатурний фокус. Escape закриває без втрати фокуса; підказка не зникає, поки вказівник на ній.">
      <div className="pg-row" style={{ paddingTop: "var(--ix-space-10)", paddingBottom: "var(--ix-space-10)" }}>
        <Tooltip content="Останнє оновлення о 14:20">
          <Button>Статус (top)</Button>
        </Tooltip>
        <Tooltip content="Дані синхронізуються кожні 5 хвилин" placement="bottom">
          <Button variant="ghost">Синхронізація (bottom)</Button>
        </Tooltip>
        <IconButton label="Фільтр" icon={icons.filter} />
        <IconButton label="Додати підрозділ" icon={icons.plus} variant="secondary" tooltipPlacement="bottom" />
        <IconButton label="Структура (праворуч, як у колонці навігації)" icon={<Icon name="org-structure" />} tooltipPlacement="right" />
        <IconButton label="Підказка ліворуч" icon={<Icon name="panel-end" />} tooltipPlacement="left" />
      </div>
    </Section>
  );
}

const stateKinds: readonly DataStateKind[] = ["loading", "empty", "incomplete", "unavailable", "stale", "denied", "error"];

function CardsStatesSection() {
  return (
    <Section
      title="Card / Badge / DataState"
      note="Card — єдиний контейнер віджетів і розділів (raised — рівень card, flat — група в панелі). Стани даних із PRODUCT.md: збій і відсутність доступу — явний стан, не нуль."
    >
      <div className="pg-cards">
        <Card title="Донесення за добу" subtitle="Форма F-12 · сьогодні" actions={<IconButton label="Налаштувати" icon={icons.widgetSettings} />} footer={<Badge tone="info">Вибірка 10 %</Badge>}>
          <KpiTile label="Донесень" value={212} delta={{ value: 12, period: "до вчора" }} />
        </Card>
        <Card title="Вибрана картка" selected footer={<Badge tone="warning" icon={<Icon name="stale" size={16} />}>Застаріло · 2 год тому</Badge>}>
          <p className="pg-text">Вибір — контур кольору індикатора і внутрішнє кільце.</p>
        </Card>
      </div>
      <div className="pg-row">
        <Badge>Чернетка</Badge>
        <Badge tone="success">Надіслано</Badge>
        <Badge tone="warning">Неповний</Badge>
        <Badge tone="error">Помилка</Badge>
        <Badge tone="info">Вибірка</Badge>
      </div>
      <div className="pg-cards">
        {stateKinds.map((kind) => (
          <Card key={kind} aria-label={`Стан ${kind}`}>
            <DataState kind={kind} description={kind === "unavailable" ? "Сервер батальйону не відповідає." : undefined} action={kind === "error" ? <Button>Повторити</Button> : undefined} />
          </Card>
        ))}
      </div>
      <Card aria-label="Компактний стан">
        <DataState kind="stale" size="compact" description="Оновлено о 07:40" />
      </Card>
    </Section>
  );
}

const tableRows = Array.from({ length: 12 }, (_, index) => ({
  id: `R-${1000 + index}`,
  unit: `Підрозділ ${(index % 4) + 1}`,
  status: index % 4 === 1 ? "Чернетка" : "Надіслано",
  value: (index * 37) % 500,
}));

function TableSection() {
  const [sort, setSort] = useState<TableSort | null>({ key: "value", direction: "descending" });
  const [current, setCurrent] = useState<string | null>("R-1002");
  const rows = [...tableRows].sort((a, b) => {
    if (!sort) return 0;
    const key = sort.key as "unit" | "value";
    return (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (sort.direction === "ascending" ? 1 : -1);
  });
  return (
    <Section title="DataTable" note="Нативна таблиця в ScrollArea: липкий заголовок, сортування кнопкою з aria-sort, вибір рядка кнопкою в заголовку рядка. Числа — табличні цифри праворуч.">
      <DataTable
        label="Записи (Playground)"
        variant="well"
        className="pg-table"
        columns={[
          { key: "id", header: "ID", mono: true },
          { key: "unit", header: "Підрозділ", sortable: true },
          { key: "status", header: "Статус", render: (row) => <Badge tone={row.status === "Чернетка" ? "neutral" : "success"}>{row.status}</Badge> },
          { key: "value", header: "Значення", numeric: true, sortable: true },
        ]}
        rows={rows}
        getRowId={(row) => row.id}
        sort={sort}
        onSortChange={setSort}
        currentRowId={current}
        onRowSelect={setCurrent}
      />
      <DataTable
        label="Без доступу (Playground)"
        variant="well"
        columns={[
          { key: "id", header: "ID" },
          { key: "unit", header: "Підрозділ" },
        ]}
        rows={tableRows}
        getRowId={(row) => row.id}
        state="denied"
        stateDescription="Запитайте доступ в адміністратора підрозділу."
      />
    </Section>
  );
}

function OverlaysSection() {
  return (
    <Section title="Popover / Menu" note="Popover — немодальна панель: фокус переходить у неї, Escape повертає на тригер. Menu — APG Menu Button: стрілки, Home/End, перша літера; знищувальна дія — останньою.">
      <div className="pg-row">
        <Popover label="Фільтр (Playground)" trigger={<Button iconStart={icons.filter}>Фільтр</Button>}>
          <div className="pg-stack">
            <Select label="Статус">
              <option>Усі</option>
              <option>Надіслано</option>
            </Select>
            <Button variant="primary">Застосувати</Button>
          </div>
        </Popover>
        <Menu
          label="Дії з віджетом (Playground)"
          trigger={<IconButton label="Ще" icon={<Icon name="more" />} variant="secondary" />}
          items={[
            { id: "dup", label: "Дублювати", icon: <Icon name="duplicate" size={16} />, onSelect: () => undefined },
            { id: "ren", label: "Перейменувати", icon: <Icon name="rename" size={16} />, onSelect: () => undefined },
            { id: "arc", label: "Архівувати", icon: <Icon name="archive" size={16} />, disabled: true, onSelect: () => undefined },
            { separator: true, id: "sep" },
            { id: "del", label: "Видалити", icon: <Icon name="delete" size={16} />, destructive: true, onSelect: () => undefined },
          ]}
        />
      </div>
    </Section>
  );
}

type PlaygroundNodeId = "form" | "filter" | "dash" | "input";

interface PlaygroundLayout {
  readonly nodes: Record<PlaygroundNodeId, { readonly x: number; readonly y: number; readonly frame?: string }>;
  readonly frame: { readonly x: number; readonly y: number; readonly collapsed: boolean };
  readonly bends: Record<string, readonly GraphPoint[]>;
}

/** Зміна розкладки від полотна застосовується до даних власника (тут — стан секції). */
function applyLayout(layout: PlaygroundLayout, change: GraphLayoutChange): PlaygroundLayout {
  const nodes = { ...layout.nodes };
  for (const item of change.nodes) {
    const id = item.id as PlaygroundNodeId;
    const frame = item.frame === undefined ? nodes[id].frame : (item.frame ?? undefined);
    nodes[id] = { x: item.x, y: item.y, frame };
  }
  const frame = change.frames.find((item) => item.id === "processing");
  const bends = { ...layout.bends };
  for (const edge of change.edges) bends[edge.id] = edge.bends;
  return { nodes, frame: frame ? { ...layout.frame, ...frame } : layout.frame, bends };
}

function GraphSection() {
  const [selected, setSelected] = useState("form");
  // Положення нод, фрейма і згини — дані власника: полотно повідомляє завершені зміни.
  const [layout, setLayout] = useState<PlaygroundLayout>({
    nodes: {
      input: { x: 20, y: 40 },
      form: { x: 260, y: 60, frame: "processing" },
      filter: { x: 260, y: 200, frame: "processing" },
      dash: { x: 560, y: 120 },
    },
    frame: { x: 240, y: 0, collapsed: false },
    bends: { b: [] },
  });
  return (
    <Section
      title="Граф"
      note="GraphCanvas, GraphNode, GraphFrame: сітка 20, перетягування з контуром попереднього результату й напрямними; нода, кинута на іншу, розсуває сусідів (закріплена — ні). Ребра обходять ноди й розходяться смугами; подвійний клік на ребрі додає згин, на згині — видаляє. Заголовок фрейма згортає його й переносить разом із нодами."
    >
      <GraphCanvas
        label="Граф (Playground)"
        className="pg-graph"
        onLayoutChange={(change) => setLayout((current) => applyLayout(current, change))}
        edges={[
          { id: "i", from: "input:out", to: "form:in" },
          { id: "a", from: "form:out", to: "filter:in", state: selected === "form" || selected === "filter" ? "selected" : "default" },
          { id: "b", from: "filter:out", to: "dash:in", state: "invalid", bends: layout.bends["b"] },
          { id: "c", from: "form:out", to: "dash:in" },
        ]}
      >
        <GraphFrame id="processing" label="Обробка" {...layout.frame} width={260} height={340} />
        <GraphNode
          id="input"
          type="Unit Input"
          name="Вхід від бригади"
          icon={<Icon name="group-input" size={16} />}
          {...layout.nodes.input}
          pinned
          outputs={[{ id: "input:out", label: "Дані", connected: true }]}
          selected={selected === "input"}
          onSelect={() => setSelected("input")}
        />
        <GraphNode
          id="form"
          type="Form"
          name="Донесення F-12"
          icon={<Icon name="node-form" size={16} />}
          {...layout.nodes.form}
          inputs={[{ id: "form:in", label: "Джерело", connected: true }]}
          outputs={[{ id: "form:out", label: "Записи", connected: true }]}
          selected={selected === "form"}
          onSelect={() => setSelected("form")}
        />
        <GraphNode
          id="filter"
          type="Filter"
          name="Лише термінові"
          icon={<Icon name="filter-node" size={16} />}
          {...layout.nodes.filter}
          inputs={[{ id: "filter:in", label: "Записи", connected: true }]}
          outputs={[{ id: "filter:out", label: "Відібрані", connected: true }]}
          selected={selected === "filter"}
          onSelect={() => setSelected("filter")}
        />
        <GraphNode
          id="dash"
          type="Dashboard"
          name="Оперативний"
          icon={<Icon name="node-dashboard" size={16} />}
          {...layout.nodes.dash}
          inputs={[{ id: "dash:in", label: "Показники", invalid: true }]}
          status={{ tone: "warning", label: "Немає джерела", icon: <Icon name="warning" size={16} /> }}
          selected={selected === "dash"}
          onSelect={() => setSelected("dash")}
        />
      </GraphCanvas>
    </Section>
  );
}


const periodOptions = [
  { value: "day", label: "День" },
  { value: "week", label: "Тиждень" },
  { value: "month", label: "Місяць" },
  { value: "year", label: "Рік" },
];

/**
 * Soft Tactical v1.2: ті самі канонічні компоненти, нова пластика з токенів.
 * Плаваюча поверхня і картка — приклади токенів elevation (surface-overlay +
 * shadow-floating, surface-raised + shadow-card); канонічний WorkspaceToolbar живе
 * в @index/ui-patterns і перевіряється в Layout Playground (apps/web).
 */
function SoftTacticalSection() {
  const [period, setPeriod] = useState("week");
  const [view, setView] = useState("list");
  return (
    <Section
      title="Soft Tactical Components"
      note="Піднятий матеріал: тональний перехід, контактна тінь і відблиск верхнього краю. Натиснутий стан — той самий матеріал, утиснутий. Поля й треки — тонке заглиблення. Перемикач «Версія токенів» угорі показує ті самі компоненти з токенами v1.1."
    >
      <p className="pg-overline">Кнопки · default / hover / active / focus / loading / disabled</p>
      <Matrix
        columns={["Default", "Hover", "Active", "Focus", "Loading", "Disabled"]}
        rows={(["secondary", "primary", "accent", "destructive", "ghost"] as const).map((variant) => ({
          label: variant,
          cells: [
            <Button variant={variant}>Застосувати</Button>,
            <Button variant={variant} {...preview("hover")}>Застосувати</Button>,
            <Button variant={variant} {...preview("active")}>Застосувати</Button>,
            <Button variant={variant} {...preview("focus")}>Застосувати</Button>,
            <Button variant={variant} loading>Застосувати</Button>,
            <Button variant={variant} disabled>Застосувати</Button>,
          ],
        }))}
      />
      <div className="pg-grid pg-grid--wide" style={{ marginTop: "var(--ix-space-4)" }}>
        <Cell title="Raised IconButton / ghost у щільній панелі">
          <div className="pg-row">
            <IconButton variant="secondary" label="Додати" icon={icons.plus} />
            <IconButton variant="secondary" label="Фільтр" icon={icons.filter} {...preview("active")} />
            <IconButton label="Налаштування" icon={icons.settings} />
            <IconButton label="Видалити" icon={icons.trash} />
          </div>
        </Cell>
        <Cell title="Segmented Control">
          <div className="pg-row">
            <SegmentedControl label="Період" hideLabel value={period} onValueChange={setPeriod} options={periodOptions} />
          </div>
          <SegmentedControl
            label="Вигляд"
            hideLabel
            iconOnly
            value={view}
            onValueChange={setView}
            options={[
              { value: "list", label: "Список", icon: icons.filter },
              { value: "grid", label: "Сітка", icon: icons.settings },
            ]}
          />
          <SegmentedControl label="Неактивний" hideLabel disabled defaultValue="day" options={periodOptions.slice(0, 3)} />
        </Cell>
        <Cell title="Tabs · segmented і line">
          <Tabs defaultValue="props">
            <TabList aria-label="Розділи інспектора" variant="segmented">
              <Tab value="props">Властивості</Tab>
              <Tab value="access">Доступ</Tab>
              <Tab value="history">Історія</Tab>
            </TabList>
            <TabPanel value="props">Властивості ноди.</TabPanel>
            <TabPanel value="access">Права доступу.</TabPanel>
            <TabPanel value="history">Журнал змін.</TabPanel>
          </Tabs>
        </Cell>
        <Cell title="Input / Select · заглиблені">
          <Input label="Назва віджета" placeholder="Наприклад, Донесення за добу" />
          <Input label="Фокус" defaultValue="UNIT-0427" {...preview("focus")} />
          <Select label="Джерело" defaultValue="a">
            <option value="a">Форма F-12</option>
            <option value="b">Форма F-14</option>
          </Select>
        </Cell>
        <Cell title="Floating surface (токен shadow-floating)">
          <div className="pg-canvas">
            <div className="pg-floating" role="group" aria-label="Приклад плаваючих інструментів">
              <IconButton label="Зменшити" icon={icons.filter} />
              <IconButton label="Збільшити" icon={icons.plus} />
              <IconButton label="Налаштування полотна" icon={icons.settings} />
            </div>
          </div>
        </Cell>
        <Cell title="Card / Widget (токен shadow-card)">
          <div className="pg-card">
            <p className="pg-overline">Донесення за добу</p>
            <p className="pg-card__value">1 248</p>
            <p className="pg-muted">+4,2 % до попередньої доби</p>
          </div>
        </Cell>
        <Cell title="Tooltip (Floating)">
          <div className="pg-row" style={{ paddingTop: "var(--ix-space-8)" }}>
            <Tooltip content="Оновлено о 14:20">
              <Button>Статус</Button>
            </Tooltip>
            <IconButton variant="secondary" label="Довідка" icon={icons.settings} />
          </div>
        </Cell>
      </div>
    </Section>
  );
}

function Pane({ theme }: { readonly theme: "light" | "dark" }) {
  return (
    <div className="pg-pane" data-theme={theme}>
      <h1 className="pg-pane__title">{theme === "light" ? "Light" : "Dark"}</h1>
      <SoftTacticalSection />
      <ButtonsSection />
      <IconButtonsSection />
      <FieldsSection />
      <SelectSection />
      <ChoiceSection />
      <TabsSection />
      <ChartsSection />
      <KpiBarSection />
      <IconsSection />
      <ScrollSection />
      <TooltipSection />
      <CardsStatesSection />
      <TableSection />
      <OverlaysSection />
      <GraphSection />
    </div>
  );
}

function readMode(): Mode {
  const hash = location.hash.slice(1);
  return hash === "light" || hash === "dark" || hash === "both" ? hash : "both";
}

function App() {
  const [mode, setMode] = useState<Mode>(readMode);

  useEffect(() => {
    history.replaceState(null, "", `#${mode}`);
    // Тема кореня потрібна для фону сторінки й нативних елементів (scrollbar, select) за межами панелей.
    document.documentElement.dataset["theme"] = mode === "dark" ? "dark" : "light";
  }, [mode]);

  return (
    <>
      <header className="pg-topbar">
        <div className="pg-brand">
          <Emblem decorative />
          <strong>IndeX</strong>
          <span className="pg-muted">UI Kit · Soft Tactical v1.2 · Playground</span>
        </div>
        <RadioGroup label="Тема перегляду" orientation="horizontal" value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <Radio value="light" label="Light" />
          <Radio value="dark" label="Dark" />
          <Radio value="both" label="Обидві" />
        </RadioGroup>
        {/* Перемикача версій немає: v1.2 — чинний UI Kit (05.11.2026), v1.1 і v1.0 — архів у токенах. */}
      </header>
      <main className="pg-panes">
        {mode !== "dark" ? <Pane theme="light" /> : null}
        {mode !== "light" ? <Pane theme="dark" /> : null}
      </main>
    </>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
