import sharp from "sharp";
import fs from "fs";
import path from "path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { composite } from "./compositor.ts";
import { applyColorGrade, applyGrain, applyVignette, finalizeOutput } from "./postprocess.ts";
import { checkAndFixContrast } from "./contrast.ts";
import {
  configureFal,
  uploadToFal,
  uploadBufferToFal,
  generateImage,
  removeBackground,
  generateBlendLayer,
  cropToExact,
} from "./fal.ts";
import { loadFonts } from "./fonts.ts";
import { jsxToReact } from "./satori-jsx.ts";
import type { CompositionPlan, Overlay, SatoriPreRender } from "./types.ts";

function log(msg: string) {
  process.stderr.write(`[picture-it] ${msg}\n`);
}

export async function executePipeline(opts: {
  plan: CompositionPlan;
  assetDir: string;
  outputPath: string;
  falKey?: string;
  verbose?: boolean;
}): Promise<string> {
  const { plan, assetDir, outputPath, verbose } = opts;
  const { width, height } = plan;

  // STAGE 1.5: Satori pre-renders for satori-to-fal text
  let preRenderedPngs: { buffer: Buffer; figureNumber: number; id: string }[] = [];
  if (plan.satoriPreRenders && plan.satoriPreRenders.length > 0) {
    if (verbose) log("Stage 1.5: Pre-rendering text for FAL...");
    preRenderedPngs = await renderPreTexts(plan.satoriPreRenders);
  }

  // Ensure plan fields exist with defaults
  if (!plan.overlays) plan.overlays = [];
  if (!plan.falStep) {
    plan.falStep = {
      model: "seedream",
      prompt: "",
      sizeStrategy: { width, height },
      skip: true,
      fallbackBg: "linear-gradient(135deg, #1a1a2e 0%, #0f0f23 100%)",
    };
  }

  // STAGE 2: FAL generation
  let baseBuffer: Buffer;

  if (plan.falStep.skip) {
    if (verbose) log("Stage 2: Skipping FAL (creating gradient background)...");
    baseBuffer = await createGradientBackground(
      plan.falStep.fallbackBg || "linear-gradient(135deg, #1a1a2e 0%, #0f0f23 100%)",
      width,
      height
    );
  } else if (opts.falKey) {
    if (verbose) log("Stage 2: Generating image with FAL...");
    configureFal(opts.falKey);

    // Upload assets in parallel
    const inputImages = plan.falStep.inputImages || [];
    const uploadPromises: Promise<string>[] = [];

    for (const img of inputImages) {
      const imgPath = path.resolve(assetDir, img);
      if (fs.existsSync(imgPath)) {
        uploadPromises.push(uploadToFal(imgPath));
      }
    }

    // Upload pre-rendered text PNGs
    for (const pre of preRenderedPngs) {
      uploadPromises.push(
        uploadBufferToFal(pre.buffer, `pre-render-${pre.id}.png`)
      );
    }

    const uploadedUrls = await Promise.all(uploadPromises);

    // Background removal
    if (plan.falStep.removeBackgrounds && plan.falStep.removeBackgrounds.length > 0) {
      if (verbose) log("Removing backgrounds...");
      for (const assetName of plan.falStep.removeBackgrounds) {
        const idx = inputImages.indexOf(assetName);
        if (idx >= 0 && uploadedUrls[idx]) {
          const cleanBuf = await removeBackground(uploadedUrls[idx]!, verbose);
          // Re-upload the cleaned version
          uploadedUrls[idx] = await uploadBufferToFal(cleanBuf, `clean-${assetName}`);
        }
      }
    }

    // Generate base image
    try {
      baseBuffer = await generateImage(plan.falStep, uploadedUrls, verbose);

      // Blend layers (parallel with nothing since base is done)
      if (plan.blendLayers && plan.blendLayers.length > 0) {
        if (verbose) log("Generating blend layers...");
        const blendResults = await Promise.all(
          plan.blendLayers.map((bl) =>
            generateBlendLayer(bl, plan.falStep.model, width, height, verbose)
          )
        );

        // Composite blend layers
        let baseSharp = sharp(baseBuffer);
        for (let i = 0; i < blendResults.length; i++) {
          const bl = plan.blendLayers[i]!;
          const blendBuf = await cropToExact(blendResults[i]!, width, height);

          // Apply opacity
          const { data, info } = await sharp(blendBuf)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

          for (let j = 3; j < data.length; j += 4) {
            data[j] = Math.round(data[j]! * bl.opacity);
          }

          const opacBuf = await sharp(data, {
            raw: { width: info.width, height: info.height, channels: 4 },
          }).png().toBuffer();

          const blendMode = bl.blend === "normal" ? "over" : bl.blend;
          baseSharp = sharp(
            await baseSharp
              .composite([{ input: opacBuf, blend: blendMode as any }])
              .png()
              .toBuffer()
          );
        }
        baseBuffer = await baseSharp.png().toBuffer();
      }

      // Crop to exact dimensions
      baseBuffer = await cropToExact(
        baseBuffer,
        width,
        height,
        plan.falStep.focalPoint
      );
    } catch (e) {
      log(`FAL generation failed: ${(e as Error).message}`);
      log("Falling back to gradient background...");
      baseBuffer = await createGradientBackground(
        plan.falStep.fallbackBg || "linear-gradient(135deg, #1a1a2e 0%, #0f0f23 100%)",
        width,
        height
      );
    }
  } else {
    // No FAL key, use gradient
    if (verbose) log("No FAL key, creating gradient background...");
    baseBuffer = await createGradientBackground(
      plan.falStep.fallbackBg || "linear-gradient(135deg, #1a1a2e 0%, #0f0f23 100%)",
      width,
      height
    );
  }

  // STAGE 3: Contrast safety check
  if (verbose) log("Stage 3: Checking contrast...");
  const fixedOverlays = await checkAndFixContrast(
    baseBuffer,
    plan.overlays,
    width,
    height
  );

  // STAGE 4: Overlay compositing
  if (verbose) log("Stage 4: Compositing overlays...");
  const compositedPlan: CompositionPlan = {
    ...plan,
    overlays: fixedOverlays,
  };
  let result = await composite(compositedPlan, baseBuffer, assetDir, verbose);

  // STAGE 5: Post-processing
  if (verbose) log("Stage 5: Post-processing...");

  if (plan.colorGrade) {
    result = await applyColorGrade(result, plan.colorGrade);
  }

  if (plan.grain) {
    result = await applyGrain(result);
  }

  if (plan.vignette) {
    result = await applyVignette(result);
  }

  // Write output
  await finalizeOutput(result, outputPath);

  if (verbose) log(`Output: ${outputPath}`);
  return outputPath;
}

async function renderPreTexts(
  preRenders: SatoriPreRender[]
): Promise<{ buffer: Buffer; figureNumber: number; id: string }[]> {
  const fonts = await loadFonts();
  const results: { buffer: Buffer; figureNumber: number; id: string }[] = [];

  for (const pre of preRenders) {
    const reactElement = jsxToReact(pre.jsx);
    const svg = await satori(reactElement, {
      width: pre.width,
      height: pre.height,
      fonts,
    });
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: pre.width } });
    const pngBuffer = Buffer.from(resvg.render().asPng());
    results.push({ buffer: pngBuffer, figureNumber: pre.figureNumber, id: pre.id });
  }

  return results;
}

async function createGradientBackground(
  gradient: string,
  width: number,
  height: number
): Promise<Buffer> {
  const fonts = await loadFonts();

  const jsx = {
    type: "div",
    props: {
      style: {
        width,
        height,
        backgroundImage: gradient,
        display: "flex",
      },
      children: [],
    },
  };

  const svg = await satori(jsx as any, { width, height, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return Buffer.from(resvg.render().asPng());
}

export { createGradientBackground };
