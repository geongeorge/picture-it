import { fal } from "@fal-ai/client";
import sharp from "sharp";
import fs from "fs";
import type { FalStep, FalModel, BlendLayer, CropPosition } from "./types.ts";

function log(msg: string) {
  process.stderr.write(`[picture-it] ${msg}\n`);
}

const MODEL_ENDPOINTS: Record<string, string> = {
  seedream: "fal-ai/bytedance/seedream/v4.5/edit",
  banana2: "fal-ai/nano-banana-2/edit",
  "banana-pro": "fal-ai/nano-banana-pro/edit",
  "flux-dev": "fal-ai/flux/dev",
  "flux-schnell": "fal-ai/flux/schnell",
};

const MODEL_COSTS: Record<string, number> = {
  seedream: 0.04,
  banana2: 0.08,
  "banana-pro": 0.15,
  "flux-dev": 0.03,
  "flux-schnell": 0.003,
};

export function configureFal(apiKey: string) {
  fal.config({ credentials: apiKey });
}

export async function uploadToFal(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const filename = filePath.split("/").pop() || "image.png";
  const file = new File([buffer], filename, { type: "image/png" });
  const url = await fal.storage.upload(file);
  return url;
}

export async function uploadBufferToFal(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const file = new File([buffer], filename, { type: "image/png" });
  const url = await fal.storage.upload(file);
  return url;
}

export async function generateImage(
  step: FalStep,
  uploadedUrls: string[],
  verbose = false
): Promise<Buffer> {
  const endpoint = MODEL_ENDPOINTS[step.model];
  if (!endpoint) throw new Error(`Unknown model: ${step.model}`);

  const cost = MODEL_COSTS[step.model] || 0;
  log(`Model: ${step.model} ($${cost.toFixed(2)}) | Estimated cost: $${cost.toFixed(2)}`);

  const isGenerationModel = step.model === "flux-dev" || step.model === "flux-schnell";

  let input: Record<string, unknown>;

  if (isGenerationModel) {
    // Generation only, no input images
    input = {
      prompt: step.prompt,
      num_images: 1,
      image_size: buildImageSize(step),
    };
  } else if (step.model === "seedream") {
    input = {
      prompt: step.prompt,
      image_urls: uploadedUrls,
      image_size: buildImageSize(step),
      num_images: 1,
      max_images: 1,
    };
  } else if (step.model === "banana2") {
    const sizeStrategy = step.sizeStrategy as { aspectRatio?: string; resolution?: string };
    input = {
      prompt: step.prompt,
      image_urls: uploadedUrls,
      aspect_ratio: sizeStrategy.aspectRatio || "auto",
      resolution: sizeStrategy.resolution || "1K",
      output_format: "png",
      num_images: 1,
      limit_generations: true,
      ...(step.thinkingLevel && { thinking_level: step.thinkingLevel }),
      ...(step.webSearch && { enable_web_search: true }),
    };
  } else if (step.model === "banana-pro") {
    const sizeStrategy = step.sizeStrategy as { aspectRatio?: string; resolution?: string };
    input = {
      prompt: step.prompt,
      image_urls: uploadedUrls,
      aspect_ratio: sizeStrategy.aspectRatio || "auto",
      resolution: sizeStrategy.resolution || "1K",
      output_format: "png",
      num_images: 1,
      ...(step.webSearch && { enable_web_search: true }),
    };
  } else {
    throw new Error(`Unhandled model: ${step.model}`);
  }

  if (verbose) log(`Calling ${endpoint} with prompt: ${step.prompt.slice(0, 100)}...`);

  const result = await fal.subscribe(endpoint, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS" && verbose) {
        for (const entry of (update as any).logs || []) {
          log(`FAL: ${entry.message}`);
        }
      }
    },
  });

  const imageUrl = (result as any).data?.images?.[0]?.url;
  if (!imageUrl) throw new Error("FAL returned no image");

  if (verbose) log(`Downloading FAL output...`);
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download FAL output: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function removeBackground(
  imageUrl: string,
  verbose = false
): Promise<Buffer> {
  if (verbose) log(`Removing background via birefnet...`);

  const result = await fal.subscribe("fal-ai/birefnet", {
    input: { image_url: imageUrl },
  });

  const outputUrl = (result as any).data?.image?.url;
  if (!outputUrl) throw new Error("birefnet returned no image");

  const response = await fetch(outputUrl);
  return Buffer.from(await response.arrayBuffer());
}

export async function generateBlendLayer(
  layer: BlendLayer,
  model: FalModel,
  width: number,
  height: number,
  verbose = false
): Promise<Buffer> {
  const endpoint = MODEL_ENDPOINTS["flux-schnell"]; // Use schnell for blend layers (fast + cheap)

  const result = await fal.subscribe(endpoint, {
    input: {
      prompt: layer.prompt,
      num_images: 1,
      image_size: mapToAspectSize(width, height),
    },
  });

  const imageUrl = (result as any).data?.images?.[0]?.url;
  if (!imageUrl) throw new Error("FAL returned no blend layer image");

  const response = await fetch(imageUrl);
  return Buffer.from(await response.arrayBuffer());
}

function buildImageSize(step: FalStep): unknown {
  const ss = step.sizeStrategy;
  if ("width" in ss && "height" in ss) {
    // SeedDream supports custom dimensions
    return { width: ss.width, height: ss.height };
  }
  // Return a preset for generation models
  return "landscape_16_9";
}

function mapToAspectSize(
  width: number,
  height: number
): string {
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.1) return "square_hd";
  if (ratio > 1.5) return "landscape_16_9";
  if (ratio < 0.67) return "portrait_16_9";
  if (ratio > 1) return "landscape_4_3";
  return "portrait_4_3";
}

export function mapAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.1) return "1:1";
  if (Math.abs(ratio - 16 / 9) < 0.15) return "16:9";
  if (Math.abs(ratio - 9 / 16) < 0.15) return "9:16";
  if (Math.abs(ratio - 4 / 3) < 0.15) return "4:3";
  if (Math.abs(ratio - 3 / 4) < 0.15) return "3:4";
  if (Math.abs(ratio - 3 / 2) < 0.15) return "3:2";
  if (Math.abs(ratio - 2 / 3) < 0.15) return "2:3";
  if (Math.abs(ratio - 21 / 9) < 0.2) return "21:9";
  if (ratio >= 3.5) return "4:1";
  return "auto";
}

export function mapResolution(width: number, height: number): string {
  const maxDim = Math.max(width, height);
  if (maxDim <= 512) return "0.5K";
  if (maxDim <= 1024) return "1K";
  if (maxDim <= 2048) return "2K";
  return "4K";
}

export async function cropToExact(
  buffer: Buffer,
  width: number,
  height: number,
  focalPoint?: CropPosition
): Promise<Buffer> {
  let position: string | { left: number; top: number } = "attention";

  if (focalPoint) {
    if (typeof focalPoint === "string") {
      position = focalPoint;
    } else {
      position = {
        left: Math.round(focalPoint.left),
        top: Math.round(focalPoint.top),
      };
    }
  }

  return sharp(buffer)
    .resize(width, height, {
      fit: "cover",
      position: position as any,
    })
    .png()
    .toBuffer();
}
