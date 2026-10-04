// Lists images in public/photos/ so the app can preload them.
import { readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "photos");
const files = (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp|gif|avif)$/i.test(f)).sort();
await writeFile(join(dir, "manifest.json"), JSON.stringify(files));
console.log(`[photos] ${files.length} preset photo(s)`);
