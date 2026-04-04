import sharp from "sharp";
import path from "path";
import type { AssetAnalysis } from "./types.ts";

export async function analyzeAsset(assetPath: string): Promise<AssetAnalysis> {
  const img = sharp(assetPath);
  const meta = await img.metadata();
  const stats = await img.stats();

  const width = meta.width || 0;
  const height = meta.height || 0;
  const aspectRatio = width / (height || 1);

  // Check transparency
  const hasTransparency =
    meta.channels === 4 && meta.hasAlpha === true;

  // Dominant colors via tiny resize
  const { data: thumbData } = await img
    .resize(8, 8, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const colors = extractDominantColors(thumbData);

  // Content type heuristic
  const contentType = guessContentType(
    width,
    height,
    aspectRatio,
    hasTransparency
  );

  return {
    path: assetPath,
    filename: path.basename(assetPath),
    width,
    height,
    aspectRatio: Math.round(aspectRatio * 100) / 100,
    hasTransparency,
    dominantColors: colors,
    contentType,
  };
}

export async function analyzeAssets(
  assetPaths: string[]
): Promise<AssetAnalysis[]> {
  return Promise.all(assetPaths.map(analyzeAsset));
}

function extractDominantColors(data: Buffer): string[] {
  const colorCounts = new Map<string, number>();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;

    if (a < 128) continue; // Skip transparent pixels

    // Quantize to reduce unique colors
    const qr = Math.round(r / 32) * 32;
    const qg = Math.round(g / 32) * 32;
    const qb = Math.round(b / 32) * 32;
    const hex = rgbToHex(qr, qg, qb);

    colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
  }

  // Sort by frequency, return top 5
  return [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hex]) => hex);
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.min(255, Math.max(0, c)).toString(16).padStart(2, "0"))
      .join("")
  );
}

function guessContentType(
  width: number,
  height: number,
  aspectRatio: number,
  hasTransparency: boolean
): AssetAnalysis["contentType"] {
  // Square + transparency = icon/logo
  if (Math.abs(aspectRatio - 1) < 0.15 && hasTransparency) {
    if (width <= 256) return "avatar";
    return "icon";
  }

  // Square, no transparency, small
  if (Math.abs(aspectRatio - 1) < 0.15 && !hasTransparency && width <= 256) {
    return "avatar";
  }

  // Wide + no transparency = screenshot
  if (aspectRatio > 1.3 && !hasTransparency) {
    return "screenshot";
  }

  // Has transparency but not square = cutout/logo
  if (hasTransparency) {
    return "cutout";
  }

  return "photo";
}

export function formatAnalysis(analysis: AssetAnalysis): string {
  return (
    `${analysis.filename}: ${analysis.width}x${analysis.height} ` +
    `${Math.abs(analysis.aspectRatio - 1) < 0.15 ? "square" : analysis.aspectRatio > 1 ? "landscape" : "portrait"}, ` +
    `${analysis.hasTransparency ? "has transparency" : "no transparency"}, ` +
    `likely ${analysis.contentType}, ` +
    `dominant colors: ${analysis.dominantColors.join(", ")}`
  );
}
