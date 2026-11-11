# UPSTREAM — джерело UI Kit

| Поле | Значення |
|---|---|
| Репозиторій-джерело | IndeX (локально `C:\Projects\IndeX-pilot`, лише читання) |
| Гілка | `main` (віддалена `origin/main`) |
| Повний SHA | `0450585c311a07c47c502b572d53ad68ee50c969` |
| Коміт | «feat(admin): «Адміністрування» — користувачі й вхід за запрошенням (VS-DEC-12)», 2026-11-06 |
| Дата копіювання | 2026-11-11 |
| Версія UI Kit | `0.0.0` (усі три пакети; окремого версіювання в IndeX немає, версією є SHA) |

Увага: локальна `main` в IndeX відставала від `origin/main` на 23 коміти (6beb2f7). Скопійовано `origin/main`
через `git archive` (без checkout, pull чи fetch; робочу копію IndeX не змінено).

## Скопійовані пакети (без змін, імена `@index/*`)

- `packages/ui` ← `packages/ui` (`@index/ui`)
- `packages/ui-patterns` ← `packages/ui-patterns` (`@index/ui-patterns`)
- `packages/design-tokens` ← `packages/design-tokens` (`@index/design-tokens`)

Копіювалися лише файли, відстежувані git (`git archive`): без `node_modules`, `dist`, кешів. Перевірено `diff -r`: ідентично.

## Стек IndeX (на цьому SHA)

- **Менеджер пакетів:** pnpm 11.23.0 (`packageManager`), `pnpm-workspace.yaml`: `apps/*`, `packages/*`; `allowBuilds: nx, esbuild`.
  Node 24 (запуск `.ts` напряму через `node`). Оркестрація збірки — Nx 24.0.3 (`nx.json`, `build → ^build`).
- **React / TypeScript:** React і react-dom 19.3.1 (peer: `^19.0.0`), `@types/react(-dom)` 19.3.0, TypeScript 5.9.3.
- **Збирач:** esbuild 0.28.2 (скрипт `apps/web/scripts/serve.ts`, `bundle`, `format: esm`, `jsx: automatic`, `.woff2` як `file`).
  **Vite у IndeX немає.** Пакети збираються `tsc` у `dist` (`rewriteRelativeImportExtensions`), застосунок споживає їх через `exports`.
- **Стилі й токени:** звичайний CSS, жодних CSS Modules / vanilla-extract. Токени — CSS-змінні `--ix-*`,
  згенеровані в `design-tokens/generated/tokens.css` (генератор `scripts/generate.ts`). Теми: атрибут `data-theme="light|dark"`
  на `<html>`, без атрибута — `prefers-color-scheme`. Компоненти використовують лише семантичні токени.
  Підключення: `import "@index/ui-patterns/styles.css"` (тягне `@index/ui` і токени разом із шрифтом).
- **tsconfig:** `tsconfig.base.json` — target ES2022, module/moduleResolution NodeNext, `strict`, `noUncheckedIndexedAccess`,
  `declaration`, `verbatimModuleSyntax`, `forceConsistentCasingInFileNames`, `skipLibCheck`.
  У пакетах: `jsx: react-jsx`, `erasableSyntaxOnly`, `rewriteRelativeImportExtensions`, `allowImportingTsExtensions` (для noEmit).
- **Лінтер і форматер:** немає (немає ESLint, Prettier, Biome, `.editorconfig`). Якість — `tsc`, тести й власні скрипти
  (`tools/check_structure.py`, `check_boundaries.py`, заборона колірних літералів у тесті UI Kit).
- **Тести:** вбудований `node:test` (збірка `tsc -p tsconfig.test.json` → `node --test dist/test-build/...`),
  jsdom 30.1.3 + axe-core 4.14.0. **Vitest/Playwright/Testing Library у IndeX немає.**
- **Шрифти:** локально. Inter (variable, 4 підмножини woff2) вендорений у `design-tokens/fonts/inter`
  (SIL OFL), `generated/fonts.css` посилається відносними шляхами. Зовнішніх запитів немає.

### Залежності пакетів UI Kit

`@index/design-tokens`
- dependencies: —
- peerDependencies: —
- devDependencies: `@fontsource-variable/inter` 5.3.0, `@types/node` 24.10.1

`@index/ui`
- dependencies: `@index/design-tokens` (workspace:*)
- peerDependencies: `react` ^19.0.0, `react-dom` ^19.0.0
- devDependencies: `@types/jsdom` 30.0.0, `@types/node` 24.10.1, `@types/react` 19.3.0, `@types/react-dom` 19.3.0,
  `axe-core` 4.14.0, `esbuild` 0.28.2, `jsdom` 30.1.3, `react` 19.3.1, `react-dom` 19.3.1

`@index/ui-patterns`
- dependencies: `@index/design-tokens`, `@index/ui` (workspace:*)
- peerDependencies: `react` ^19.0.0, `react-dom` ^19.0.0
- devDependencies: `@types/jsdom` 30.0.0, `@types/node` 24.10.1, `@types/react` 19.3.0, `@types/react-dom` 19.3.0,
  `axe-core` 4.14.0, `jsdom` 30.1.3, `react` 19.3.1, `react-dom` 19.3.1

## Локальні зміни

Дозволені користувачем 2026-11-11 («якщо щось треба змінити на рівні UI Kit — зроби це»). Кожна зміна позначена в коді коментарем «ЛОКАЛЬНА ЗМІНА».

| Файл | Зміна | Навіщо |
|---|---|---|
| `packages/ui-patterns/src/index.ts` | До публічних exports додано `FeedbackProvider` і `FeedbackLayer` (самі компоненти не змінено) | Застосунок має власну оболонку (навігація з підписами, сітка сторінки, бічна картка без накладень) замість `AppShell`/`WorkspaceLayout`, а повідомлення раніше вмикав лише `AppShell` |

| `packages/ui-patterns/tests/architecture.test.ts` | У тесті переліку публічного API додано ці два імені | Тест набору фіксує точний список експортів |

При оновленні набору з IndeX ці зміни треба перенести заново.
