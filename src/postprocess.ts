import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import type { ColorGrade } from "./types.ts";

export async function applyColorGrade(
  buffer: Buffer,
  grade: ColorGrade
): Promise<Buffer> {
  let img = sharp(buffer);

  switch (grade) {
    case "cinematic":
      // Teal shadows, warm highlights
      img = img
        .recomb([
          [1.05, 0, 0.05],
          [0, 1.1, 0],
          [0.05, 0, 1.15],
        ])
        .linear(1.1, -10);
      break;
    case "moody":
      // Desaturated, crushed blacks
      img = img.modulate({ saturation: 0.8 }).linear(1.15, 5);
      break;
    case "vibrant":
      img = img.modulate({ saturation: 1.3 });
      break;
    case "clean":
      img = img.sharpen({ sigma: 0.5 });
      break;
    case "warm-editorial":
      img = img
        .tint({ r: 255, g: 220, b: 180 })
        .modulate({ saturation: 0.9 });
      break;
    case "cool-tech":
      img = img
        .tint({ r: 180, g: 200, b: 255 })
        .linear(1.2, -15);
      break;
  }

  return img.png().toBuffer();
}

export async function applyGrain(
  buffer: Buffer,
  intensity = 0.07
): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width!;
  const h = meta.height!;

  // Generate noise texture
  const noiseData = Buffer.alloc(w * h * 4);
  for (let i = 0; i < noiseData.length; i += 4) {
    const v = Math.round(128 + (Math.random() - 0.5) * 80);
    noiseData[i] = v;     // R
    noiseData[i + 1] = v; // G
    noiseData[i + 2] = v; // B
    noiseData[i + 3] = Math.round(255 * intensity); // A
  }

  const noiseBuffer = await sharp(noiseData, {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toBuffer();

  return sharp(buffer)
    .composite([{ input: noiseBuffer, blend: "overlay" }])
    .png()
    .toBuffer();
}

export async function applyVignette(
  buffer: Buffer,
  opacity = 0.35
): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width!;
  const h = meta.height!;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <radialGradient id="vig" cx="50%" cy="50%" r="70%">
        <stop offset="50%" stop-color="black" stop-opacity="0"/>
        <stop offset="100%" stop-color="black" stop-opacity="${opacity}"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#vig)"/>
  </svg>`;

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: w } });
  const vigBuffer = Buffer.from(resvg.render().asPng());

  return sharp(buffer)
    .composite([{ input: vigBuffer, blend: "multiply" }])
    .png()
    .toBuffer();
}

export async function finalizeOutput(
  buffer: Buffer,
  outputPath: string,
  quality = 90
): Promise<void> {
  const ext = outputPath.split(".").pop()?.toLowerCase();
  let img = sharp(buffer);

  switch (ext) {
    case "jpg":
    case "jpeg":
      await img.jpeg({ quality: quality || 85 }).toFile(outputPath);
      break;
    case "webp":
      await img.webp({ quality: quality || 85 }).toFile(outputPath);
      break;
    default:
      await img.png({ quality: quality || 90 }).toFile(outputPath);
      break;
  }
}
