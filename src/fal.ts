import { fal } from "@fal-ai/client";
import fs from "fs";
import sharp from "sharp";
import { log } from "./operations.ts";
import {
  getEndpoint,
  getCost,
  selectGenerateModel,
  selectEditModel,
  mapAspectRatio,
  mapResolution,
} from "./model-router.ts";
import type { FalModel, CropPosition } from "./types.ts";

export function configureFal(apiKey: string) {
  fal.config({ credentials: apiKey });
}

// --- Upload ---

export async function uploadFile(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const filename = filePath.split("/").pop() || "image.png";
  const file = new File([buffer], filename, { type: "image/png" });
  return fal.storage.upload(file);
}

export async function uploadBuffer(buffer: Buffer, filename: string): Promise<string> {
  const file = new File([buffer], filename, { type: "image/png" });
  return fal.storage.upload(file);
}

// --- Generate (no input images) ---

export async function generate(opts: {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  verbose?: boolean;
}): Promise<Buffer> {
  const model = selectGenerateModel(opts.model, opts.verbose);
  const endpoint = getEndpoint(model);
  const cost = getCost(model);

  log(`FAL generate: ${model} @ $${cost.toFixed(3)}`);

  const w = opts.width || 1200;
  const h = opts.height || 630;

  const input: Record<string, unknown> = {
    prompt: opts.prompt,
    num_images: 1,
    image_size: mapFluxSize(w, h),
  };

  const result = await fal.subscribe(endpoint, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS" && opts.verbose) {
        for (const entry of (update as any).logs || []) {
          log(`FAL: ${entry.message}`);
        }
      }
    },
  });

  return downloadResult(result);
}

// --- Edit (with input images) ---

export async function edit(opts: {
  inputUrls: string[];
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
  verbose?: boolean;
}): Promise<Buffer> {
  const model = selectEditModel(opts.inputUrls.length, opts.model, opts.verbose);
  const endpoint = getEndpoint(model);
  const cost = getCost(model);

  log(`FAL edit: ${model} @ $${cost.toFixed(2)} | ${opts.inputUrls.length} input(s)`);

  const w = opts.width || 1200;
  const h = opts.height || 630;

  let input: Record<string, unknown>;

  if (model === "seedream") {
    input = {
      prompt: opts.prompt,
      image_urls: opts.inputUrls,
      image_size: seedreamSize(w, h),
      num_images: 1,
      max_images: 1,
    };
  } else if (model === "banana2") {
    input = {
      prompt: opts.prompt,
      image_urls: opts.inputUrls,
      aspect_ratio: mapAspectRatio(w, h),
      resolution: mapResolution(w, h),
      output_format: "png",
      num_images: 1,
      limit_generations: true,
    };
  } else {
    // banana-pro — minimal params, let it auto-detect
    input = {
      prompt: opts.prompt,
      image_urls: opts.inputUrls,
      num_images: 1,
    };
  }

  const result = await fal.subscribe(endpoint, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS" && opts.verbose) {
        for (const entry of (update as any).logs || []) {
          log(`FAL: ${entry.message}`);
        }
      }
    },
  });

  return downloadResult(result);
}

// --- Remove background ---

export type BgRemovalModel = "birefnet" | "bria" | "pixelcut" | "rembg";

const BG_REMOVAL_ENDPOINTS: Record<BgRemovalModel, string> = {
  birefnet: "fal-ai/birefnet",
  bria: "fal-ai/bria/background/remove",
  pixelcut: "fal-ai/pixelcut/background-removal",
  rembg: "fal-ai/smoretalk-ai/rembg-enhance",
};

export async function removeBg(opts: {
  inputUrl: string;
  model?: string;
  verbose?: boolean;
}): Promise<Buffer> {
  const model = (opts.model || "bria") as BgRemovalModel;
  const endpoint = BG_REMOVAL_ENDPOINTS[model] || BG_REMOVAL_ENDPOINTS.bria;

  log(`FAL: ${model} background removal`);

  const result = await fal.subscribe(endpoint, {
    input: { image_url: opts.inputUrl },
  });

  // Different models return the image in different fields
  const data = (result as any).data;
  const outputUrl = data?.image?.url || data?.images?.[0]?.url;
  if (!outputUrl) throw new Error(`${model} returned no image`);

  const response = await fetch(outputUrl);
  return Buffer.from(await response.arrayBuffer());
}

// --- Upscale ---

export async function upscale(opts: {
  inputUrl: string;
  scale?: number;
  verbose?: boolean;
}): Promise<Buffer> {
  log(`FAL: upscale ${opts.scale || 2}x`);

  // Use creative upscaler
  const result = await fal.subscribe("fal-ai/creative-upscaler", {
    input: {
      image_url: opts.inputUrl,
      scale: opts.scale || 2,
    },
  });

  return downloadResult(result);
}

// --- Crop to exact size ---

export async function cropToExact(
  buffer: Buffer,
  width: number,
  height: number,
  position: CropPosition = "attention"
): Promise<Buffer> {
  return sharp(buffer)
    .resize(width, height, {
      fit: "cover",
      position: position as any,
    })
    .png()
    .toBuffer();
}

// --- Helpers ---

async function downloadResult(result: any): Promise<Buffer> {
  const url = result?.data?.images?.[0]?.url || result?.data?.image?.url;
  if (!url) throw new Error("FAL returned no image URL");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function mapFluxSize(w: number, h: number): string {
  const ratio = w / h;
  if (Math.abs(ratio - 1) < 0.1) return "square_hd";
  if (ratio > 1.5) return "landscape_16_9";
  if (ratio < 0.67) return "portrait_16_9";
  if (ratio > 1) return "landscape_4_3";
  return "portrait_4_3";
}

function seedreamSize(w: number, h: number): unknown {
  // SeedDream supports custom dimensions (1920-4096px per axis)
  if (w >= 1920 && h >= 1080 && w <= 4096 && h <= 4096) {
    return { width: w, height: h };
  }
  // Fall back to preset
  return "auto_2K";
}
