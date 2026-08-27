import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { buildScreenSVG } from "./lib.mjs";
import { screens } from "./data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../../docs/screen-spec");
mkdirSync(outDir, { recursive: true });

function slug(name) {
  return name
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

screens.forEach((screen, i) => {
  const num = String(i + 1).padStart(2, "0");
  const fname = `${num}_${slug(screen.screenName)}.svg`;
  const svg = buildScreenSVG(screen);
  writeFileSync(path.join(outDir, fname), svg, "utf-8");
  console.log("wrote", fname);
});

console.log(`\nTotal ${screens.length} screens -> ${outDir}`);
