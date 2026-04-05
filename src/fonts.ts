import fs from "fs";
import path from "path";
import { APP_DIR } from "./config.ts";

const USER_FONT_DIR = path.join(APP_DIR, "fonts");
const LOCAL_FONT_DIR = path.join(import.meta.dirname, "..", "fonts");

interface SatoriFont {
  name: string;
  data: ArrayBuffer;
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style: "normal" | "italic";
}

const FONT_FILES: {
  name: string;
  file: string;
  weight: SatoriFont["weight"];
  style: SatoriFont["style"];
  url: string;
}[] = [
  {
    name: "Inter",
    file: "Inter-Regular.ttf",
    weight: 400,
    style: "normal",
    url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
  },
  {
    name: "Inter",
    file: "Inter-SemiBold.ttf",
    weight: 600,
    style: "normal",
    url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf",
  },
  {
    name: "Inter",
    file: "Inter-Bold.ttf",
    weight: 700,
    style: "normal",
    url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf",
  },
  {
    name: "Space Grotesk",
    file: "SpaceGrotesk-Medium.ttf",
    weight: 500,
    style: "normal",
    url: "https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj7aUUsj.ttf",
  },
  {
    name: "Space Grotesk",
    file: "SpaceGrotesk-Bold.ttf",
    weight: 700,
    style: "normal",
    url: "https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj4PVksj.ttf",
  },
  {
    name: "DM Serif Display",
    file: "DMSerifDisplay-Regular.ttf",
    weight: 400,
    style: "normal",
    url: "https://fonts.gstatic.com/s/dmserifdisplay/v17/-nFnOHM81r4j6k0gjAW3mujVU2B2K_c.ttf",
  },
];

let cachedFonts: SatoriFont[] | null = null;

function getFontPathCandidates(file: string): string[] {
  return [
    path.join(USER_FONT_DIR, file),
    path.join(LOCAL_FONT_DIR, file),
  ];
}

function readFontFile(file: string): Buffer | null {
  for (const fontPath of getFontPathCandidates(file)) {
    try {
      return fs.readFileSync(fontPath);
    } catch {
      // Try the next font location.
    }
  }

  return null;
}

export function getFontDirectory(): string {
  return USER_FONT_DIR;
}

export async function downloadFonts(options: {
  force?: boolean;
  onProgress?: (message: string) => void;
} = {}): Promise<{ dir: string; downloaded: string[]; skipped: string[] }> {
  const { force = false, onProgress } = options;
  const downloaded: string[] = [];
  const skipped: string[] = [];

  fs.mkdirSync(USER_FONT_DIR, { recursive: true });

  for (const font of FONT_FILES) {
    const outPath = path.join(USER_FONT_DIR, font.file);

    if (!force && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
      skipped.push(font.file);
      onProgress?.(`Already installed: ${font.file}`);
      continue;
    }

    onProgress?.(`Downloading: ${font.file}`);
    const res = await fetch(font.url);
    if (!res.ok) {
      throw new Error(`Failed to download ${font.file}: ${res.status} ${res.statusText}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    downloaded.push(font.file);
    onProgress?.(`Saved: ${font.file} (${(buf.length / 1024).toFixed(0)} KB)`);
  }

  cachedFonts = null;

  return {
    dir: USER_FONT_DIR,
    downloaded,
    skipped,
  };
}

export async function loadFonts(): Promise<SatoriFont[]> {
  if (cachedFonts) return cachedFonts;

  const fonts: SatoriFont[] = [];
  const available: string[] = [];
  const missing: string[] = [];

  for (const f of FONT_FILES) {
    const data = readFontFile(f.file);
    if (!data) {
      missing.push(f.file);
      continue;
    }

    fonts.push({
      name: f.name,
      data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      weight: f.weight,
      style: f.style,
    });
    available.push(f.file);
  }

  if (missing.length > 0) {
    process.stderr.write(`[picture-it] Warning: missing fonts: ${missing.join(", ")}\n`);
    process.stderr.write(`[picture-it] Run: picture-it download-fonts to fetch them\n`);
  }

  if (fonts.length === 0) {
    throw new Error("No fonts available. Run: picture-it download-fonts");
  }

  cachedFonts = fonts;
  return fonts;
}
