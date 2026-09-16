// Copies the canonical lesson/component data from the .NET backend into the
// frontend's public assets so the Cloudflare Worker can serve them statically.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "..", "backend", "Synapsys.Api", "Data");
const dest = join(root, "public", "data");

mkdirSync(dest, { recursive: true });
for (const file of ["lessons.json", "components.json"]) {
  copyFileSync(join(source, file), join(dest, file));
  console.log(`copied ${file}`);
}
