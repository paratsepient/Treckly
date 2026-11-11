/**
 * Вендоринг Inter у `fonts/inter/`.
 *
 * Без аргументів копіює woff2 і ліцензію з npm-пакета та пише маніфест SHA-256.
 * `--check` нічого не пише: падає, якщо файли на диску не відповідають маніфесту
 * або (коли пакет-джерело встановлено) відрізняються від його файлів.
 * Шрифти зберігаються в репозиторії, щоб збірка не залежала від мережі.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fontSourcePackage, interSubsets } from "../src/typography/font-faces.ts";

const packageRoot = join(import.meta.dirname, "..");
const targetDir = join(packageRoot, "fonts", "inter");
const manifestPath = join(targetDir, "manifest.json");
const licenseFile = "OFL.txt";

interface FontManifest {
  readonly source: string;
  readonly version: string;
  readonly license: string;
  readonly files: Record<string, string>;
}

const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

function sourceRoot(): string | null {
  try {
    const require = createRequire(join(packageRoot, "package.json"));
    return dirname(require.resolve(`${fontSourcePackage}/package.json`));
  } catch {
    return null;
  }
}

/** Пари «файл у репозиторії» → «файл у пакеті-джерелі». */
function sourceFiles(root: string): Array<[string, string]> {
  return [
    ...interSubsets.map((subset): [string, string] => [subset.file, join(root, "files", subset.file)]),
    [licenseFile, join(root, "LICENSE")],
  ];
}

function vendor(): void {
  const root = sourceRoot();
  if (root === null) {
    throw new Error(`Пакет ${fontSourcePackage} не встановлено; виконайте pnpm install.`);
  }
  const version = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
  mkdirSync(targetDir, { recursive: true });
  const files: Record<string, string> = {};
  for (const [name, from] of sourceFiles(root)) {
    const content = readFileSync(from);
    writeFileSync(join(targetDir, name), content);
    files[name] = sha256(content);
  }
  const manifest: FontManifest = {
    source: fontSourcePackage,
    version,
    license: "SIL Open Font License 1.1",
    files,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Inter ${version}: скопійовано ${Object.keys(files).length} файлів у fonts/inter/`);
}

function check(): void {
  const problems: string[] = [];
  if (!existsSync(manifestPath)) {
    problems.push("відсутній fonts/inter/manifest.json");
  } else {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as FontManifest;
    const expected = [...interSubsets.map((subset) => subset.file), licenseFile].sort();
    if (JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify(expected)) {
      problems.push("маніфест не відповідає списку файлів у src/typography/font-faces.ts");
    }
    for (const [name, hash] of Object.entries(manifest.files)) {
      const path = join(targetDir, name);
      if (!existsSync(path) || sha256(readFileSync(path)) !== hash) {
        problems.push(`${name}: вміст не відповідає маніфесту`);
      }
    }
    const root = sourceRoot();
    if (root !== null) {
      for (const [name, from] of sourceFiles(root)) {
        if (existsSync(from) && manifest.files[name] !== sha256(readFileSync(from))) {
          problems.push(`${name}: відрізняється від ${fontSourcePackage}; виконайте pnpm --filter @index/design-tokens fonts`);
        }
      }
    }
  }
  if (problems.length > 0) {
    console.error("FAIL: шрифти Inter:");
    for (const problem of problems) console.error(` - ${problem}`);
    process.exit(1);
  }
  console.log("PASS: шрифти Inter відповідають маніфесту і ліцензія присутня.");
}

if (process.argv.includes("--check")) {
  check();
} else {
  vendor();
}
