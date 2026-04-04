#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";

const FONT_DIR = path.join(import.meta.dirname, "..", "fonts");
fs.mkdirSync(FONT_DIR, { recursive: true });

// Static TTF files from Google Fonts CDN (Satori can't parse variable fonts)
const FONTS = [
  {
    file: "Inter-Regular.ttf",
    url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
  },
  {
    file: "Inter-SemiBold.ttf",
    url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf",
  },
  {
    file: "Inter-Bold.ttf",
    url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf",
  },
  {
    file: "SpaceGrotesk-Medium.ttf",
    url: "https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj7aUUsj.ttf",
  },
  {
    file: "SpaceGrotesk-Bold.ttf",
    url: "https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj4PVksj.ttf",
  },
  {
    file: "DMSerifDisplay-Regular.ttf",
    url: "https://fonts.gstatic.com/s/dmserifdisplay/v17/-nFnOHM81r4j6k0gjAW3mujVU2B2K_c.ttf",
  },
];

async function main() {
  for (const font of FONTS) {
    const outPath = path.join(FONT_DIR, font.file);

    console.log(`Downloading: ${font.file}`);
    const res = await fetch(font.url);
    if (!res.ok) throw new Error(`Failed to download ${font.url}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    console.log(`Saved: ${font.file} (${(buf.length / 1024).toFixed(0)} KB)`);
  }

  console.log("\nAll fonts downloaded.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
