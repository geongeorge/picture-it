import sharp, { type OverlayOptions } from "sharp";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import path from "path";
import { resolvePosition, resolveDimension } from "./zones.ts";
import { DEPTH_ORDER, AUTO_SHADOW } from "./presets.ts";
import { loadFonts } from "./fonts.ts";
import { jsxToReact } from "./satori-jsx.ts";
import type {
  Overlay,
  ImageOverlay,
  SatoriTextOverlay,
  ShapeOverlay,
  GradientOverlay,
  WatermarkOverlay,
  CompositionPlan,
  DepthLayer,
  ShadowConfig,
} from "./types.ts";

function log(msg: string) {
  process.stderr.write(`[picture-it] ${msg}\n`);
}

export async function composite(
  plan: CompositionPlan,
  baseImage: Buffer,
  assetDir: string,
  verbose = false
): Promise<Buffer> {
  const { width, height, overlays } = plan;
  let canvas = sharp(baseImage).resize(width, height, {
    fit: "cover",
    position: "center",
  });
  let canvasBuffer = await canvas.png().toBuffer();

  // Sort overlays by depth
  const sorted = [...overlays].sort((a, b) => {
    const da = DEPTH_ORDER[a.depth || "overlay"] ?? 3;
    const db = DEPTH_ORDER[b.depth || "overlay"] ?? 3;
    return da - db;
  });

  for (const overlay of sorted) {
    if (verbose) log(`Compositing ${overlay.type} at depth ${overlay.depth || "overlay"}`);

    canvasBuffer = await compositeOverlay(
      canvasBuffer,
      overlay,
      width,
      height,
      assetDir,
      verbose
    );
  }

  return canvasBuffer;
}

async function compositeOverlay(
  canvasBuffer: Buffer,
  overlay: Overlay,
  canvasWidth: number,
  canvasHeight: number,
  assetDir: string,
  verbose: boolean
): Promise<Buffer> {
  switch (overlay.type) {
    case "image":
      return compositeImage(canvasBuffer, overlay, canvasWidth, canvasHeight, assetDir, verbose);
    case "satori-text":
      return compositeSatoriText(canvasBuffer, overlay, canvasWidth, canvasHeight, verbose);
    case "shape":
      return compositeShape(canvasBuffer, overlay, canvasWidth, canvasHeight, verbose);
    case "gradient-overlay":
      return compositeGradient(canvasBuffer, overlay, canvasWidth, canvasHeight, verbose);
    case "watermark":
      return compositeWatermark(canvasBuffer, overlay, canvasWidth, canvasHeight, assetDir, verbose);
  }
}

async function compositeImage(
  canvasBuffer: Buffer,
  overlay: ImageOverlay,
  canvasWidth: number,
  canvasHeight: number,
  assetDir: string,
  verbose: boolean
): Promise<Buffer> {
  const assetPath = path.resolve(assetDir, overlay.src);
  let asset = sharp(assetPath);
  const meta = await asset.metadata();
  const origW = meta.width || 100;
  const origH = meta.height || 100;

  // Resolve target dimensions
  let targetW = resolveDimension(overlay.width, canvasWidth, origW);
  let targetH = resolveDimension(overlay.height, canvasHeight, origH);

  // If only one dimension specified, maintain aspect ratio
  if (overlay.width && !overlay.height) {
    targetH = Math.round(targetW * (origH / origW));
  } else if (overlay.height && !overlay.width) {
    targetW = Math.round(targetH * (origW / origH));
  }

  // Apply mask
  if (overlay.mask) {
    asset = await applyMask(asset, targetW, targetH, overlay.mask);
  }

  // Apply border radius
  if (overlay.borderRadius) {
    asset = await applyBorderRadius(asset, targetW, targetH, overlay.borderRadius);
  }

  // Resize
  asset = asset.resize(targetW, targetH, { fit: "cover" });

  // Apply rotation
  if (overlay.rotation) {
    asset = asset.rotate(overlay.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }

  let assetBuffer = await asset.png().toBuffer();

  // Calculate position
  const pos = resolvePosition(
    overlay.zone || "hero-center",
    canvasWidth,
    canvasHeight,
    targetW,
    targetH,
    overlay.anchor || "center"
  );

  const composites: OverlayOptions[] = [];

  // Shadow
  if (overlay.shadow) {
    const shadowConfig = resolveShadow(overlay.shadow, overlay.depth);
    if (shadowConfig) {
      const shadowBuf = await createShadow(assetBuffer, targetW, targetH, shadowConfig);
      composites.push({
        input: shadowBuf,
        left: Math.max(0, pos.x + shadowConfig.offsetX),
        top: Math.max(0, pos.y + shadowConfig.offsetY),
        blend: "over",
      });
    }
  }

  // Glow
  if (overlay.glow) {
    const glowBuf = await createGlow(assetBuffer, targetW, targetH, overlay.glow);
    const glowExtend = overlay.glow.spread + overlay.glow.blur;
    composites.push({
      input: glowBuf,
      left: Math.max(0, pos.x - glowExtend),
      top: Math.max(0, pos.y - glowExtend),
      blend: "over",
    });
  }

  // Reflection
  if (overlay.reflection) {
    const reflBuf = await createReflection(assetBuffer, targetW, targetH, overlay.reflection);
    composites.push({
      input: reflBuf,
      left: pos.x,
      top: pos.y + targetH + 2,
      blend: "over",
    });
  }

  // Main image
  const opacity = overlay.opacity ?? 1;
  if (opacity < 1) {
    assetBuffer = await applyOpacity(assetBuffer, opacity);
  }

  composites.push({
    input: assetBuffer,
    left: Math.max(0, pos.x),
    top: Math.max(0, pos.y),
    blend: "over",
  });

  return sharp(canvasBuffer)
    .composite(composites)
    .png()
    .toBuffer();
}

async function compositeSatoriText(
  canvasBuffer: Buffer,
  overlay: SatoriTextOverlay,
  canvasWidth: number,
  canvasHeight: number,
  verbose: boolean
): Promise<Buffer> {
  const textW = overlay.width || canvasWidth;
  const textH = overlay.height || canvasHeight;

  const fonts = await loadFonts();
  const reactElement = jsxToReact(overlay.jsx);

  const svg = await satori(reactElement, {
    width: textW,
    height: textH,
    fonts,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: textW },
  });
  const pngBuffer = resvg.render().asPng();

  const pos = resolvePosition(
    overlay.zone || "title-area",
    canvasWidth,
    canvasHeight,
    textW,
    textH,
    overlay.anchor || "center"
  );

  let input: Buffer = Buffer.from(pngBuffer);
  const opacity = overlay.opacity ?? 1;
  if (opacity < 1) {
    input = await applyOpacity(input, opacity);
  }

  return sharp(canvasBuffer)
    .composite([
      {
        input,
        left: Math.max(0, pos.x),
        top: Math.max(0, pos.y),
        blend: "over",
      },
    ])
    .png()
    .toBuffer();
}

async function compositeShape(
  canvasBuffer: Buffer,
  overlay: ShapeOverlay,
  canvasWidth: number,
  canvasHeight: number,
  verbose: boolean
): Promise<Buffer> {
  const w = overlay.width || 100;
  const h = overlay.height || 100;

  let svgContent = "";
  const fill = overlay.fill || "white";
  const stroke = overlay.stroke || "none";
  const strokeW = overlay.strokeWidth || 0;

  switch (overlay.shape) {
    case "rect":
      svgContent = `<rect x="${strokeW / 2}" y="${strokeW / 2}" width="${w - strokeW}" height="${h - strokeW}" rx="${overlay.borderRadius || 0}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>`;
      break;
    case "circle":
      svgContent = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${(w - strokeW) / 2}" ry="${(h - strokeW) / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>`;
      break;
    case "line":
      if (overlay.from && overlay.to) {
        svgContent = `<line x1="${overlay.from.x}" y1="${overlay.from.y}" x2="${overlay.to.x}" y2="${overlay.to.y}" stroke="${stroke || fill}" stroke-width="${strokeW || 2}"/>`;
      }
      break;
    case "arrow":
      if (overlay.from && overlay.to) {
        const headSize = overlay.headSize || 10;
        svgContent = `
          <defs><marker id="ah" markerWidth="${headSize}" markerHeight="${headSize}" refX="${headSize}" refY="${headSize / 2}" orient="auto">
            <polygon points="0 0, ${headSize} ${headSize / 2}, 0 ${headSize}" fill="${stroke || fill}" />
          </marker></defs>
          <line x1="${overlay.from.x}" y1="${overlay.from.y}" x2="${overlay.to.x}" y2="${overlay.to.y}" stroke="${stroke || fill}" stroke-width="${strokeW || 2}" marker-end="url(#ah)"/>`;
      }
      break;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${svgContent}</svg>`;
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: w } });
  let pngBuffer: Buffer = Buffer.from(resvg.render().asPng());

  const pos = resolvePosition(
    overlay.zone || "hero-center",
    canvasWidth,
    canvasHeight,
    w,
    h,
    "center"
  );

  const opacity = overlay.opacity ?? 1;
  if (opacity < 1) {
    pngBuffer = await applyOpacity(pngBuffer, opacity);
  }

  return sharp(canvasBuffer)
    .composite([
      {
        input: pngBuffer,
        left: Math.max(0, pos.x),
        top: Math.max(0, pos.y),
        blend: "over",
      },
    ])
    .png()
    .toBuffer();
}

async function compositeGradient(
  canvasBuffer: Buffer,
  overlay: GradientOverlay,
  canvasWidth: number,
  canvasHeight: number,
  verbose: boolean
): Promise<Buffer> {
  const fonts = await loadFonts();

  const jsx = {
    type: "div",
    props: {
      style: {
        width: canvasWidth,
        height: canvasHeight,
        backgroundImage: overlay.gradient,
        display: "flex",
      },
      children: [],
    },
  };

  const svg = await satori(jsx as any, {
    width: canvasWidth,
    height: canvasHeight,
    fonts,
  });

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: canvasWidth } });
  let gradBuffer: Buffer = Buffer.from(resvg.render().asPng());

  const opacity = overlay.opacity ?? 1;
  if (opacity < 1) {
    gradBuffer = await applyOpacity(gradBuffer, opacity);
  }

  const blend = overlay.blend || "normal";
  const sharpBlend = blend === "normal" ? "over" : blend;

  return sharp(canvasBuffer)
    .composite([
      {
        input: gradBuffer,
        left: 0,
        top: 0,
        blend: sharpBlend as any,
      },
    ])
    .png()
    .toBuffer();
}

async function compositeWatermark(
  canvasBuffer: Buffer,
  overlay: WatermarkOverlay,
  canvasWidth: number,
  canvasHeight: number,
  assetDir: string,
  verbose: boolean
): Promise<Buffer> {
  const assetPath = path.resolve(assetDir, overlay.src);
  const size = overlay.size || 48;
  const margin = overlay.margin || 20;
  const opacity = overlay.opacity ?? 0.3;

  let asset = await sharp(assetPath)
    .resize(size, size, { fit: "inside" })
    .png()
    .toBuffer();

  const meta = await sharp(asset).metadata();
  const w = meta.width || size;
  const h = meta.height || size;

  if (opacity < 1) {
    asset = await applyOpacity(asset, opacity);
  }

  let x: number, y: number;
  switch (overlay.position || "bottom-right") {
    case "bottom-right":
      x = canvasWidth - w - margin;
      y = canvasHeight - h - margin;
      break;
    case "bottom-left":
      x = margin;
      y = canvasHeight - h - margin;
      break;
    case "top-right":
      x = canvasWidth - w - margin;
      y = margin;
      break;
    case "top-left":
      x = margin;
      y = margin;
      break;
  }

  return sharp(canvasBuffer)
    .composite([
      {
        input: asset,
        left: x!,
        top: y!,
        blend: "over",
      },
    ])
    .png()
    .toBuffer();
}

// --- Effect helpers ---

function resolveShadow(
  shadow: ShadowConfig | "auto",
  depth?: DepthLayer
): ShadowConfig | null {
  if (shadow === "auto") {
    const preset = AUTO_SHADOW[depth || "foreground"];
    if (!preset) return null;
    return {
      blur: preset.blur,
      color: `rgba(0,0,0,0.5)`,
      offsetX: preset.offset,
      offsetY: preset.offset,
      opacity: preset.opacity,
    };
  }
  return shadow;
}

async function createShadow(
  assetBuffer: Buffer,
  width: number,
  height: number,
  config: ShadowConfig
): Promise<Buffer> {
  // Tint to shadow color and blur
  let shadow = sharp(assetBuffer)
    .ensureAlpha()
    .tint(config.color)
    .blur(Math.max(0.3, config.blur));

  let buf = await shadow.png().toBuffer();

  if (config.opacity !== undefined && config.opacity < 1) {
    buf = await applyOpacity(buf, config.opacity);
  }

  return buf;
}

async function createGlow(
  assetBuffer: Buffer,
  width: number,
  height: number,
  config: { color: string; blur: number; spread: number }
): Promise<Buffer> {
  const extend = config.spread + config.blur;

  let glow = sharp(assetBuffer)
    .ensureAlpha()
    .tint(config.color)
    .extend({
      top: extend,
      bottom: extend,
      left: extend,
      right: extend,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .blur(Math.max(0.3, config.blur));

  return glow.png().toBuffer();
}

async function createReflection(
  assetBuffer: Buffer,
  width: number,
  height: number,
  config: { opacity: number; fadeHeight: number }
): Promise<Buffer> {
  // Flip vertically
  const flipped = await sharp(assetBuffer).flip().png().toBuffer();

  // Create gradient alpha mask (opaque at top, transparent at bottom)
  const fadeH = Math.round(height * (config.fadeHeight / 100));
  const gradientSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="white" stop-opacity="1"/>
        <stop offset="${fadeH / height}" stop-color="white" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#fade)"/>
  </svg>`;

  const maskResvg = new Resvg(gradientSvg, { fitTo: { mode: "width", value: width } });
  const maskBuffer = Buffer.from(maskResvg.render().asPng());

  // Apply mask
  let result = await sharp(flipped)
    .composite([{ input: maskBuffer, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Apply opacity
  if (config.opacity < 1) {
    result = await applyOpacity(result, config.opacity);
  }

  return result;
}

async function applyMask(
  asset: sharp.Sharp,
  width: number,
  height: number,
  mask: string
): Promise<sharp.Sharp> {
  let svgShape: string;

  switch (mask) {
    case "circle":
      svgShape = `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="white"/>`;
      break;
    case "rounded":
      svgShape = `<rect width="${width}" height="${height}" rx="${Math.min(width, height) * 0.1}" ry="${Math.min(width, height) * 0.1}" fill="white"/>`;
      break;
    case "hexagon": {
      const cx = width / 2, cy = height / 2;
      const r = Math.min(width, height) / 2;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
      }).join(" ");
      svgShape = `<polygon points="${pts}" fill="white"/>`;
      break;
    }
    case "diamond": {
      const cx = width / 2, cy = height / 2;
      svgShape = `<polygon points="${cx},0 ${width},${cy} ${cx},${height} 0,${cy}" fill="white"/>`;
      break;
    }
    default:
      // Custom SVG path data
      svgShape = `<path d="${mask}" fill="white"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${svgShape}</svg>`;
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  const maskBuffer = Buffer.from(resvg.render().asPng());

  const resized = await asset.resize(width, height, { fit: "cover" }).png().toBuffer();

  const masked = await sharp(resized)
    .composite([{ input: maskBuffer, blend: "dest-in" }])
    .png()
    .toBuffer();

  return sharp(masked);
}

async function applyBorderRadius(
  asset: sharp.Sharp,
  width: number,
  height: number,
  radius: number
): Promise<sharp.Sharp> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/>
  </svg>`;
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  const maskBuffer = Buffer.from(resvg.render().asPng());

  const resized = await asset.resize(width, height, { fit: "cover" }).png().toBuffer();

  const masked = await sharp(resized)
    .composite([{ input: maskBuffer, blend: "dest-in" }])
    .png()
    .toBuffer();

  return sharp(masked);
}

async function applyOpacity(buffer: Buffer, opacity: number): Promise<Buffer> {
  // Multiply all alpha values by opacity
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i]! * opacity);
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
