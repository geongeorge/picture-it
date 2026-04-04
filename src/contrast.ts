import sharp from "sharp";
import { resolvePosition, resolveDimension } from "./zones.ts";
import type { SatoriTextOverlay, GradientOverlay, Overlay } from "./types.ts";

function log(msg: string) {
  process.stderr.write(`[picture-it] ${msg}\n`);
}

// WCAG relative luminance
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!;
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseColor(color: string): { r: number; g: number; b: number } | null {
  // Handle hex
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0]! + hex[0]!, 16),
        g: parseInt(hex[1]! + hex[1]!, 16),
        b: parseInt(hex[2]! + hex[2]!, 16),
      };
    }
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  }

  // Handle rgb/rgba
  const rgbMatch = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/
  );
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]!),
      g: parseInt(rgbMatch[2]!),
      b: parseInt(rgbMatch[3]!),
    };
  }

  // Named colors
  const named: Record<string, { r: number; g: number; b: number }> = {
    white: { r: 255, g: 255, b: 255 },
    black: { r: 0, g: 0, b: 0 },
  };
  return named[color.toLowerCase()] || null;
}

function extractTextColor(jsx: any): string {
  if (jsx?.props?.style?.color) return jsx.props.style.color;
  if (jsx?.children) {
    for (const child of Array.isArray(jsx.children) ? jsx.children : [jsx.children]) {
      if (typeof child === "object") {
        const c = extractTextColor(child);
        if (c) return c;
      }
    }
  }
  return "white"; // default assumption
}

export async function checkAndFixContrast(
  baseBuffer: Buffer,
  overlays: Overlay[],
  canvasWidth: number,
  canvasHeight: number
): Promise<Overlay[]> {
  const result = [...overlays];
  const inserts: { index: number; overlay: GradientOverlay }[] = [];

  for (let i = 0; i < result.length; i++) {
    const overlay = result[i]!;
    if (overlay.type !== "satori-text") continue;

    const textOverlay = overlay as SatoriTextOverlay;
    const textW = textOverlay.width || canvasWidth;
    const textH = textOverlay.height || canvasHeight;

    const pos = resolvePosition(
      textOverlay.zone || "title-area",
      canvasWidth,
      canvasHeight,
      textW,
      textH,
      textOverlay.anchor || "center"
    );

    // Crop the region where text will land
    const cropX = Math.max(0, Math.min(pos.x, canvasWidth - 1));
    const cropY = Math.max(0, Math.min(pos.y, canvasHeight - 1));
    const cropW = Math.min(textW, canvasWidth - cropX);
    const cropH = Math.min(textH, canvasHeight - cropY);

    if (cropW <= 0 || cropH <= 0) continue;

    const region = await sharp(baseBuffer)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .grayscale()
      .stats();

    const bgLuminance = (region.channels[0]?.mean || 128) / 255;

    // Extract text color from JSX
    const textColor = extractTextColor(textOverlay.jsx);
    const parsed = parseColor(textColor);
    const textLum = parsed
      ? relativeLuminance(parsed.r, parsed.g, parsed.b)
      : 1; // assume white

    const ratio = contrastRatio(bgLuminance, textLum);

    if (ratio < 4.5) {
      log(
        `Low contrast (${ratio.toFixed(1)}:1) at ${JSON.stringify(textOverlay.zone)}, adding safety overlay`
      );

      // Determine if we need dark or light overlay
      const needDark = textLum > 0.5; // Light text → dark overlay behind it
      const gradColor = needDark ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";

      const safetyOverlay: GradientOverlay = {
        type: "gradient-overlay",
        gradient: `linear-gradient(180deg, transparent 0%, ${gradColor} 30%, ${gradColor} 70%, transparent 100%)`,
        opacity: 0.7,
        blend: "normal",
        depth: (textOverlay.depth as any) || "overlay",
      };

      // Insert before the text overlay
      inserts.push({ index: i, overlay: safetyOverlay });
    }
  }

  // Insert safety overlays in reverse order to maintain indices
  for (const ins of inserts.reverse()) {
    result.splice(ins.index, 0, ins.overlay);
  }

  return result;
}
