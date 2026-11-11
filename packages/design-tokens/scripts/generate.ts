/**
 * Генерує файли в generated/ з src/.
 *
 * `--check` нічого не пише: падає, якщо файли на диску відрізняються від
 * свіжої генерації. Так ручне редагування generated-файлів ловиться в CI.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { renderAll } from "./render.ts";

const packageRoot = join(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");

// Git на Windows може віддати CRLF; порівнюємо зміст, а не кінці рядків.
const normalize = (text: string): string => text.replace(/\r\n/g, "\n");

const outdated: string[] = [];

for (const [relative, content] of Object.entries(renderAll())) {
  const target = join(packageRoot, relative);
  if (checkOnly) {
    const current = existsSync(target) ? normalize(readFileSync(target, "utf8")) : null;
    if (current !== content) {
      outdated.push(relative);
    }
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
  console.log(`згенеровано ${relative}`);
}

if (checkOnly) {
  if (outdated.length > 0) {
    console.error("FAIL: generated-файли не відповідають src/:");
    for (const file of outdated) {
      console.error(` - ${file}`);
    }
    console.error("Запустіть `pnpm --filter @index/design-tokens generate`.");
    process.exit(1);
  }
  console.log("PASS: generated-файли актуальні.");
}
