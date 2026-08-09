import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Point fontconfig at bundled DejaVu fonts before sharp/librsvg renders SVG
 * text. Helvetica/Arial are absent on Vercel and render as tofu boxes.
 */
export const MAP_FONT_FAMILY = "DejaVu Sans";
export const MAP_FONT_DIR = join(process.cwd(), "assets", "fonts");

const confDir = join("/tmp", "nb-wxbrief-fontconfig");
const confFile = join(confDir, "fonts.conf");

try {
  mkdirSync(confDir, { recursive: true });
  writeFileSync(
    confFile,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${MAP_FONT_DIR}</dir>
  <cachedir>${join(confDir, "cache")}</cachedir>
</fontconfig>
`,
  );
  process.env.FONTCONFIG_FILE = confFile;
} catch {
  // Best-effort; map request will still attempt DejaVu by family name.
}
