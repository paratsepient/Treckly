/**
 * Браузеру потрібні готові демо-дані, а не генератор: `faker` приносить мегабайти даних і
 * рядки зі сторонніми адресами (сервіси зображень), яких у збірці без інтернету бути не
 * повинно. Тому набір генерується тут у `src/seed-data.json`, а `@dsp/seed/browser` лише
 * читає його. `--check` перевіряє, що файл збігається з тим, що дає генератор.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateSeed } from "../src/generate.ts";

const target = join(import.meta.dirname, "..", "src", "seed-data.json");
const output = `${JSON.stringify(generateSeed(), null, 1)}\n`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {
    // файла ще немає
  }
  if (current !== output) {
    console.error("seed-data.json застарів: запустіть `pnpm --filter @dsp/seed generate`.");
    process.exit(1);
  }
  console.log("PASS: демо-дані в JSON актуальні.");
} else {
  writeFileSync(target, output);
  console.log("Демо-дані записано в src/seed-data.json");
}
