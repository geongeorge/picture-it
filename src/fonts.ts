import fs from "fs";
import path from "path";

const FONT_DIR = path.join(import.meta.dirname, "..", "fonts");

interface SatoriFont {
  name: string;
  data: ArrayBuffer;
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style: "normal" | "italic";
}

const FONT_FILES: { name: string; file: string; weight: SatoriFont["weight"]; style: SatoriFont["style"] }[] = [
  { name: "Inter", file: "Inter-Regular.ttf", weight: 400, style: "normal" },
  { name: "Inter", file: "Inter-SemiBold.ttf", weight: 600, style: "normal" },
  { name: "Inter", file: "Inter-Bold.ttf", weight: 700, style: "normal" },
  { name: "Space Grotesk", file: "SpaceGrotesk-Medium.ttf", weight: 500, style: "normal" },
  { name: "Space Grotesk", file: "SpaceGrotesk-Bold.ttf", weight: 700, style: "normal" },
  { name: "DM Serif Display", file: "DMSerifDisplay-Regular.ttf", weight: 400, style: "normal" },
];

let cachedFonts: SatoriFont[] | null = null;

export async function loadFonts(): Promise<SatoriFont[]> {
  if (cachedFonts) return cachedFonts;

  const fonts: SatoriFont[] = [];
  const available: string[] = [];
  const missing: string[] = [];

  for (const f of FONT_FILES) {
    const fontPath = path.join(FONT_DIR, f.file);
    try {
      const data = fs.readFileSync(fontPath);
      fonts.push({
        name: f.name,
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        weight: f.weight,
        style: f.style,
      });
      available.push(f.file);
    } catch {
      missing.push(f.file);
    }
  }

  if (missing.length > 0) {
    process.stderr.write(`[picture-it] Warning: missing fonts: ${missing.join(", ")}\n`);
    process.stderr.write(`[picture-it] Run: bun run download-fonts to fetch them\n`);
  }

  if (fonts.length === 0) {
    throw new Error("No fonts available. Run: bun run download-fonts");
  }

  cachedFonts = fonts;
  return fonts;
}
