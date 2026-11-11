/**
 * Прототип має працювати на ПК без інтернету: жодних CDN, шрифтів чи ресурсів ззовні.
 * Перевірка збірки (`public/dist` і `index.html`):
 *  - HTML і CSS не посилаються на зовнішні адреси взагалі;
 *  - у JS дозволені лише відомі рядки бібліотек, які ніколи не запитуються
 *    (простори імен XML, документація в текстах помилок, службова адреса внутрішнього транспорту).
 * Будь-який інший хост у бандлі — збій: його треба або прибрати, або свідомо додати сюди.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "public");
const dist = join(root, "dist");

/** Хости, що трапляються в бандлі як текст і не запитуються. */
const ALLOWED_IN_JS = new Set(["www.w3.org", "json-schema.org", "react.dev", "localhost", "app.local"]);

/**
 * Лише для чанка експорту в Word: імена просторів XML формату OOXML та довідкове посилання в
 * коді бібліотеки `docx`. Це ідентифікатори в документі .docx, їх ніхто не запитує.
 */
const ALLOWED_IN_DOCX_CHUNK = new Set(["schemas.openxmlformats.org", "schemas.microsoft.com", "purl.org", "purl.oclc.org", "answers.microsoft.com"]);

/** У CSS і HTML зовнішнім вважається й посилання без протоколу (`//хост/…`); у JS — лише явний http(s)://, бо `//i.test(` там — регулярний вираз. */
const CSS_URL = /(?:https?:)?\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
const JS_URL = /https?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)*)/gi;
const problems: string[] = [];

function externalHosts(text: string, pattern: RegExp): Set<string> {
  return new Set([...text.matchAll(pattern)].map((m) => (m[1] ?? "").toLowerCase()));
}

const html = readFileSync(join(root, "index.html"), "utf8");
for (const match of html.matchAll(/(?:src|href)\s*=\s*"((?:https?:)?\/\/[^"]+)"/gi)) problems.push(`index.html: зовнішнє посилання ${match[1]}`);

for (const file of readdirSync(dist)) {
  const path = join(dist, file);
  if (file.endsWith(".css")) {
    const css = readFileSync(path, "utf8").replace(/\/\*# sourceMappingURL=.*?\*\//g, "");
    for (const host of externalHosts(css, CSS_URL)) problems.push(`${file}: зовнішній хост у CSS — ${host}`);
  } else if (file.endsWith(".js")) {
    for (const host of externalHosts(readFileSync(path, "utf8"), JS_URL)) {
      const allowedHere = ALLOWED_IN_JS.has(host) || (file.startsWith("docx-export") && ALLOWED_IN_DOCX_CHUNK.has(host));
      if (!allowedHere) problems.push(`${file}: невідомий хост у JS — ${host}`);
    }
  }
}

const required = ["pglite.wasm", "pglite.data", "initdb.wasm"];
const present = new Set(readdirSync(dist));
for (const file of required) if (!present.has(file)) problems.push(`немає локального файла ${file}`);
if (![...present].some((f) => f.endsWith(".woff2"))) problems.push("немає локальних шрифтів (.woff2)");

if (problems.length > 0) {
  console.error(`Збірка не придатна для роботи без інтернету:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("PASS: збірка без зовнішніх ресурсів; шрифти й PGlite — локально.");
