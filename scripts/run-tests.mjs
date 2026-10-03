import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const findTests = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? findTests(join(directory, entry.name)) :
    /\.test\.(ts|tsx)$/.test(entry.name) ? [join(directory, entry.name)] : []);
const result = spawnSync(process.execPath,
  [join(root, "node_modules/tsx/dist/cli.mjs"), "--test", ...findTests(join(root, "src"))],
  { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
