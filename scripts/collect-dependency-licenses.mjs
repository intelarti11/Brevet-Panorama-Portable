import { existsSync, mkdirSync, readFileSync, readdirSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Keep the notices of the locked dependencies beside the distributed binaries.
// Cargo build/development crates are included too: this inventory deliberately
// identifies dependencies, and does not assert that every crate is in the EXE.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = process.argv[2] && resolve(process.argv[2]);
if (!destination) throw new Error("Usage: node scripts/collect-dependency-licenses.mjs <destination>");
mkdirSync(destination, { recursive: true });
const inventory = [];
const markdown = (value) => String(value ?? "").replace(/[|\r\n]/g, " ");
const safeName = (value) => value.replace(/[^a-zA-Z0-9._-]/g, "_");

function copyNotices(source, target, depth = 0) {
  let count = 0;
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    if (entry.isFile() && /^(licen[cs]e|copying|copyright|notice|authors|ofl)([._-]|$)/i.test(entry.name)) {
      const to = join(target, entry.name);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      count += 1;
    } else if (entry.isDirectory() && depth < 2 && !/^(node_modules|\.git|target|test|tests|examples|src)$/i.test(entry.name)) {
      count += copyNotices(from, join(target, entry.name), depth + 1);
    }
  }
  return count;
}

const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
for (const [directory, entry] of Object.entries(lock.packages)) {
  if (!directory.startsWith("node_modules/") || entry.dev) continue;
  const source = join(root, directory);
  const manifestPath = join(source, "package.json");
  if (!existsSync(manifestPath)) continue; // Optional dependencies of another OS.
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const name = manifest.name;
  const version = manifest.version;
  const target = join(destination, "npm", safeName(`${name}-${version}`));
  const license = typeof manifest.license === "string" ? manifest.license : manifest.license?.type || entry.license || "Voir les sources";
  const files = copyNotices(source, target);
  inventory.push({ ecosystem: "npm", name, version, license, source: `https://www.npmjs.com/package/${name}/v/${version}`, files });
}

const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--manifest-path", join(root, "src-tauri/Cargo.toml"), "--format-version", "1", "--locked", "--filter-platform", "x86_64-pc-windows-msvc"], { cwd: root, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 }));
for (const pkg of metadata.packages) {
  if (!pkg.source) continue;
  const source = dirname(pkg.manifest_path);
  const target = join(destination, "cargo", safeName(`${pkg.name}-${pkg.version}`));
  let files = copyNotices(source, target);
  if (pkg.license_file) {
    const from = resolve(source, pkg.license_file);
    if (!relative(source, from).startsWith("..") && existsSync(from)) {
      mkdirSync(target, { recursive: true });
      copyFileSync(from, join(target, "LICENSE-FILE"));
      files += 1;
    }
  }
  inventory.push({ ecosystem: "Cargo", name: pkg.name, version: pkg.version, license: pkg.license || "Voir le fichier de licence", source: `https://crates.io/crates/${pkg.name}/${pkg.version}`, files });
}
inventory.sort((a, b) => a.ecosystem.localeCompare(b.ecosystem) || a.name.localeCompare(b.name));
const lines = ["# Licences des dépendances", "", "Inventaire issu des fichiers de verrouillage npm/Cargo utilisés pour cette construction Windows.", "Les crates de construction et de test sont aussi recensées ; leur présence ici ne signifie pas qu'elles sont toutes incorporées dans l'exécutable.", "Les textes disponibles dans les sources téléchargées sont conservés dans les sous-dossiers npm/ et cargo/.", "WebView2 et les polices ont leurs notices séparées. Les droits restent ceux de chaque auteur.", "", "| Écosystème | Composant | Version | Licence déclarée | Textes copiés |", "| --- | --- | --- | --- | --- |"];
for (const pkg of inventory) lines.push(`| ${pkg.ecosystem} | [${markdown(pkg.name)}](${pkg.source}) | ${markdown(pkg.version)} | ${markdown(pkg.license)} | ${pkg.files} |`);
writeFileSync(join(destination, "index.md"), `${lines.join("\n")}\n`);
writeFileSync(join(destination, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
console.log(`Notices : ${inventory.length} dépendances recensées dans ${destination}`);
