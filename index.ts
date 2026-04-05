#!/usr/bin/env bun
import { Command } from "commander";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { log, parseSize, readInput, writeOutput, ensureFalKey } from "./src/operations.ts";
import { configureFal, generate, edit, removeBg, upscale, uploadFile, uploadBuffer, cropToExact } from "./src/fal.ts";
import { composite } from "./src/compositor.ts";
import { applyColorGrade, applyGrain, applyVignette } from "./src/postprocess.ts";
import { executePipeline, createGradientBackground } from "./src/pipeline.ts";
import { getTemplate } from "./src/templates/index.ts";
import { checkAndFixContrast } from "./src/contrast.ts";
import { PLATFORM_PRESETS } from "./src/presets.ts";
import { setConfigValue, getConfigValue, listConfig, clearConfig, maskKey, getKeySource } from "./src/config.ts";
import { downloadFonts, getFontDirectory } from "./src/fonts.ts";
import type { ColorGrade, Overlay, PipelineStep, BatchEntry } from "./src/types.ts";

const program = new Command();

program
  .name("picture-it")
  .description("Photoshop for AI agents — composable image operations")
  .version("0.2.0");

// ─── GENERATE ─────────────────────────────────────────────
program
  .command("generate")
  .description("Generate an image from a text prompt")
  .requiredOption("--prompt <text>", "Image description")
  .option("--model <name>", "FAL model (flux-schnell, flux-dev, seedream)")
  .option("--size <WxH>", "Output dimensions")
  .option("--platform <name>", "Platform preset for size")
  .option("-o, --output <path>", "Output file", "output.png")
  .option("--verbose", "Detailed output")
  .action(async (opts) => {
    const falKey = ensureFalKey();
    configureFal(falKey);
    const { width, height } = parseSize(opts.size, opts.platform);
    const buf = await generate({ prompt: opts.prompt, model: opts.model, width, height, verbose: opts.verbose });
    const cropped = await cropToExact(buf, width, height);
    const out = await writeOutput(cropped, opts.output);
    console.log(out);
  });

// ─── EDIT ─────────────────────────────────────────────────
program
  .command("edit")
  .description("Edit images using AI — the primary command")
  .requiredOption("--prompt <text>", "Edit instructions")
  .requiredOption("-i, --input <paths...>", "Input image(s)")
  .option("--model <name>", "FAL model (seedream, banana2, banana-pro)")
  .option("--size <WxH>", "Output dimensions")
  .option("-o, --output <path>", "Output file", "output.png")
  .option("--verbose", "Detailed output")
  .action(async (opts) => {
    const falKey = ensureFalKey();
    configureFal(falKey);

    const inputs = opts.input as string[];
    for (const f of inputs) {
      if (!fs.existsSync(f)) { log(`Not found: ${f}`); process.exit(1); }
    }

    if (opts.verbose) log(`Uploading ${inputs.length} image(s)...`);
    const urls = await Promise.all(inputs.map((f: string) => uploadFile(path.resolve(f))));

    const meta = await sharp(inputs[0]!).metadata();
    const { width, height } = opts.size
      ? parseSize(opts.size)
      : { width: meta.width || 1200, height: meta.height || 630 };

    const buf = await edit({ inputUrls: urls, prompt: opts.prompt, model: opts.model, width, height, verbose: opts.verbose });
    const cropped = await cropToExact(buf, width, height);
    const out = await writeOutput(cropped, opts.output);
    console.log(out);
  });

// ─── REMOVE-BG ───────────────────────────────────────────
program
  .command("remove-bg")
  .description("Remove background from an image")
  .requiredOption("-i, --input <path>", "Input image")
  .option("-o, --output <path>", "Output file", "output.png")
  .option("--verbose", "Detailed output")
  .action(async (opts) => {
    const falKey = ensureFalKey();
    configureFal(falKey);
    const url = await uploadFile(path.resolve(opts.input));
    const buf = await removeBg({ inputUrl: url, verbose: opts.verbose });
    const out = await writeOutput(buf, opts.output);
    console.log(out);
  });

// ─── REPLACE-BG ──────────────────────────────────────────
program
  .command("replace-bg")
  .description("Remove background and generate a new one")
  .requiredOption("-i, --input <path>", "Input image")
  .requiredOption("--prompt <text>", "New background description")
  .option("--model <name>", "FAL model for new background")
  .option("-o, --output <path>", "Output file", "output.png")
  .option("--verbose", "Detailed output")
  .action(async (opts) => {
    const falKey = ensureFalKey();
    configureFal(falKey);

    const inputBuf = await readInput(opts.input);
    const meta = await sharp(inputBuf).metadata();
    const w = meta.width || 1200;
    const h = meta.height || 630;

    if (opts.verbose) log("Removing background...");
    const url = await uploadBuffer(inputBuf, "input.png");
    const cutout = await removeBg({ inputUrl: url, verbose: opts.verbose });

    if (opts.verbose) log("Generating new background...");
    const bg = await generate({ prompt: opts.prompt, model: opts.model, width: w, height: h, verbose: opts.verbose });
    const bgCropped = await cropToExact(bg, w, h);

    if (opts.verbose) log("Compositing...");
    const result = await sharp(bgCropped)
      .composite([{ input: cutout, blend: "over" }])
      .png()
      .toBuffer();

    const out = await writeOutput(result, opts.output);
    console.log(out);
  });

// ─── UPSCALE ─────────────────────────────────────────────
program
  .command("upscale")
  .description("AI upscale an image")
  .requiredOption("-i, --input <path>", "Input image")
  .option("--scale <n>", "Scale factor", "2")
  .option("-o, --output <path>", "Output file", "output.png")
  .option("--verbose", "Detailed output")
  .action(async (opts) => {
    const falKey = ensureFalKey();
    configureFal(falKey);
    const url = await uploadFile(path.resolve(opts.input));
    const buf = await upscale({ inputUrl: url, scale: parseInt(opts.scale), verbose: opts.verbose });
    const out = await writeOutput(buf, opts.output);
    console.log(out);
  });

// ─── CROP ────────────────────────────────────────────────
program
  .command("crop")
  .description("Crop/resize an image to exact dimensions")
  .requiredOption("-i, --input <path>", "Input image")
  .requiredOption("--size <WxH>", "Target dimensions")
  .option("--position <pos>", "Crop position (attention, center, entropy, top, bottom)", "attention")
  .option("-o, --output <path>", "Output file", "output.png")
  .action(async (opts) => {
    const inputBuf = await readInput(opts.input);
    const { width, height } = parseSize(opts.size);
    const buf = await cropToExact(inputBuf, width, height, opts.position);
    const out = await writeOutput(buf, opts.output);
    console.log(out);
  });

// ─── GRADE ───────────────────────────────────────────────
program
  .command("grade")
  .description("Apply color grading")
  .requiredOption("-i, --input <path>", "Input image")
  .requiredOption("--name <grade>", "Grade: cinematic, moody, vibrant, clean, warm-editorial, cool-tech")
  .option("-o, --output <path>", "Output file", "output.png")
  .action(async (opts) => {
    const buf = await applyColorGrade(await readInput(opts.input), opts.name as ColorGrade);
    const out = await writeOutput(buf, opts.output);
    console.log(out);
  });

// ─── GRAIN ───────────────────────────────────────────────
program
  .command("grain")
  .description("Add film grain")
  .requiredOption("-i, --input <path>", "Input image")
  .option("--intensity <n>", "Grain intensity 0-1", "0.07")
  .option("-o, --output <path>", "Output file", "output.png")
  .action(async (opts) => {
    const buf = await applyGrain(await readInput(opts.input), parseFloat(opts.intensity));
    const out = await writeOutput(buf, opts.output);
    console.log(out);
  });

// ─── VIGNETTE ────────────────────────────────────────────
program
  .command("vignette")
  .description("Add edge vignette")
  .requiredOption("-i, --input <path>", "Input image")
  .option("--opacity <n>", "Vignette opacity 0-1", "0.35")
  .option("-o, --output <path>", "Output file", "output.png")
  .action(async (opts) => {
    const buf = await applyVignette(await readInput(opts.input), parseFloat(opts.opacity));
    const out = await writeOutput(buf, opts.output);
    console.log(out);
  });

// ─── TEXT ────────────────────────────────────────────────
program
  .command("text")
  .description("Render text onto an image using Satori")
  .requiredOption("-i, --input <path>", "Input image")
  .option("--title <text>", "Text to render (simple mode)")
  .option("--font <name>", "Font family", "Space Grotesk")
  .option("--color <color>", "Text color", "white")
  .option("--font-size <n>", "Font size in pixels", "64")
  .option("--zone <name>", "Position zone", "hero-center")
  .option("--jsx <path>", "JSX overlay JSON file (advanced mode)")
  .option("-o, --output <path>", "Output file", "output.png")
  .option("--verbose", "Detailed output")
  .action(async (opts) => {
    const inputBuf = await readInput(opts.input);
    const meta = await sharp(inputBuf).metadata();
    const w = meta.width || 1200;
    const h = meta.height || 630;

    let overlays: Overlay[];

    if (opts.jsx) {
      overlays = JSON.parse(fs.readFileSync(path.resolve(opts.jsx), "utf-8"));
    } else if (opts.title) {
      overlays = [{
        type: "satori-text" as const,
        jsx: {
          tag: "div",
          props: {
            style: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" },
          },
          children: [{
            tag: "span",
            props: {
              style: {
                fontSize: parseInt(opts.fontSize),
                fontFamily: opts.font,
                fontWeight: 700,
                color: opts.color,
                textShadow: "0 2px 10px rgba(0,0,0,0.5)",
                textAlign: "center",
              },
            },
            children: [opts.title],
          }],
        },
        zone: opts.zone,
        width: Math.round(w * 0.9),
        height: Math.round(h * 0.3),
        anchor: "center" as const,
        depth: "overlay" as const,
      }];
    } else {
      log("Provide --title or --jsx");
      process.exit(1);
    }

    const result = await composite(inputBuf, overlays, w, h, process.cwd(), opts.verbose);
    const out = await writeOutput(result, opts.output);
    console.log(out);
  });

// ─── COMPOSE ─────────────────────────────────────────────
program
  .command("compose")
  .description("Composite overlays onto a background image")
  .requiredOption("-i, --input <path>", "Background image")
  .requiredOption("--overlays <path>", "Overlays JSON file")
  .option("--size <WxH>", "Output dimensions")
  .option("-o, --output <path>", "Output file", "output.png")
  .option("--verbose", "Detailed output")
  .action(async (opts) => {
    const bgBuf = await readInput(opts.input);
    const bgMeta = await sharp(bgBuf).metadata();
    const { width, height } = opts.size
      ? parseSize(opts.size)
      : { width: bgMeta.width || 1200, height: bgMeta.height || 630 };

    const overlays: Overlay[] = JSON.parse(fs.readFileSync(path.resolve(opts.overlays), "utf-8"));
    const result = await composite(bgBuf, overlays, width, height, process.cwd(), opts.verbose);
    const out = await writeOutput(result, opts.output);
    console.log(out);
  });

// ─── TEMPLATE ────────────────────────────────────────────
program
  .command("template <name>")
  .description("Generate from a built-in template (no AI)")
  .option("--platform <name>", "Platform preset", "blog-featured")
  .option("--size <WxH>", "Output dimensions")
  .option("-o, --output <path>", "Output file", "output.png")
  .option("--verbose", "Detailed output")
  .option("--left-logo <path>", "Left logo")
  .option("--right-logo <path>", "Right logo")
  .option("--logo <path>", "Logo asset")
  .option("--title <text>", "Title text")
  .option("--subtitle <text>", "Subtitle")
  .option("--badge <text>", "Badge text")
  .option("--glow-color <hex>", "Glow color")
  .option("--vs-text <text>", "VS text")
  .option("--left-label <text>", "Left label")
  .option("--right-label <text>", "Right label")
  .option("--text-color <color>", "Text color")
  .option("--background <css>", "CSS gradient")
  .option("--site-name <text>", "Site name")
  .option("--author-name <text>", "Author name")
  .option("--description <text>", "Description")
  .option("--position <pos>", "Position")
  .action(async (name, opts) => {
    const tmpl = getTemplate(name);
    if (!tmpl) {
      log(`Unknown template: ${name}. Available: vs-comparison, feature-hero, text-hero, social-card`);
      process.exit(1);
    }

    const { width, height } = parseSize(opts.size, opts.platform);

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(opts)) {
      if (value !== undefined && typeof value !== "function") {
        data[key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
      }
    }

    const result = tmpl(data, width, height);
    const bgBuffer = await createGradientBackground(result.background, width, height);
    const output = await composite(bgBuffer, result.overlays, width, height, process.cwd(), opts.verbose);
    const out = await writeOutput(output, opts.output);
    console.log(out);
  });

// ─── PIPELINE ────────────────────────────────────────────
program
  .command("pipeline")
  .description("Execute a multi-step pipeline from JSON")
  .requiredOption("--spec <path>", "Pipeline JSON file")
  .option("-o, --output <path>", "Output file", "output.png")
  .option("--verbose", "Detailed output")
  .action(async (opts) => {
    const specPath = path.resolve(opts.spec);
    if (!fs.existsSync(specPath)) { log(`Not found: ${specPath}`); process.exit(1); }
    const steps: PipelineStep[] = JSON.parse(fs.readFileSync(specPath, "utf-8"));
    const out = await executePipeline(steps, opts.output, opts.verbose);
    console.log(out);
  });

// ─── BATCH ───────────────────────────────────────────────
program
  .command("batch")
  .description("Execute multiple pipelines from JSON")
  .requiredOption("--spec <path>", "Batch spec JSON file")
  .option("--output-dir <dir>", "Output directory", ".")
  .option("--verbose", "Detailed output")
  .action(async (opts) => {
    const specPath = path.resolve(opts.spec);
    if (!fs.existsSync(specPath)) { log(`Not found: ${specPath}`); process.exit(1); }

    const entries: BatchEntry[] = JSON.parse(fs.readFileSync(specPath, "utf-8"));
    const outputDir = path.resolve(opts.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });

    const results: string[] = [];
    for (const entry of entries) {
      const outputPath = path.resolve(outputDir, entry.output || `${entry.id}.png`);
      try {
        await executePipeline(entry.pipeline, outputPath, opts.verbose);
        results.push(outputPath);
        if (opts.verbose) log(`Done: ${outputPath}`);
      } catch (e) {
        log(`Failed ${entry.id}: ${(e as Error).message}`);
      }
    }
    console.log(JSON.stringify(results));
  });

// ─── INFO ────────────────────────────────────────────────
program
  .command("info")
  .description("Analyze an image — dimensions, colors, content type")
  .requiredOption("-i, --input <path>", "Input image")
  .action(async (opts) => {
    const inputPath = path.resolve(opts.input);
    if (!fs.existsSync(inputPath)) { log(`Not found: ${inputPath}`); process.exit(1); }

    const img = sharp(inputPath);
    const meta = await img.metadata();
    const stats = await img.stats();
    const fileStat = fs.statSync(inputPath);

    const w = meta.width || 0;
    const h = meta.height || 0;
    const ratio = w / (h || 1);
    const hasAlpha = meta.hasAlpha === true && meta.channels === 4;

    // Dominant colors via tiny resize
    const { data } = await img.resize(8, 8, { fit: "cover" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const colorCounts = new Map<string, number>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! < 128) continue;
      const hex = "#" + [data[i]!, data[i + 1]!, data[i + 2]!]
        .map(c => (Math.round(c / 32) * 32).toString(16).padStart(2, "0")).join("");
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
    }
    const colors = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([h]) => h);

    let contentType = "photo";
    if (Math.abs(ratio - 1) < 0.15 && hasAlpha) contentType = w <= 256 ? "avatar" : "icon";
    else if (Math.abs(ratio - 1) < 0.15 && !hasAlpha && w <= 256) contentType = "avatar";
    else if (ratio > 1.3 && !hasAlpha) contentType = "screenshot";
    else if (hasAlpha) contentType = "cutout";

    console.log(JSON.stringify({
      path: inputPath,
      filename: path.basename(inputPath),
      width: w,
      height: h,
      aspectRatio: Math.round(ratio * 100) / 100,
      format: meta.format,
      hasTransparency: hasAlpha,
      dominantColors: colors,
      contentType,
      sizeBytes: fileStat.size,
    }, null, 2));
  });

// ─── DOWNLOAD-FONTS ─────────────────────────────────────
program
  .command("download-fonts")
  .description("Download fonts required for text and template commands")
  .option("--force", "Redownload existing font files")
  .action(async (opts) => {
    const result = await downloadFonts({
      force: opts.force,
      onProgress: (message) => log(message),
    });
    log(`Fonts ready in ${result.dir}`);
    log("Text, compose, and template commands can use them immediately.");
  });

// ─── AUTH ────────────────────────────────────────────────
program
  .command("auth")
  .description("Configure API keys")
  .option("--fal <key>", "Set FAL API key")
  .option("--status", "Show key status")
  .option("--clear", "Remove all keys")
  .action(async (opts) => {
    if (opts.status) {
      const falInfo = getKeySource("fal_key");
      log(falInfo ? `FAL_KEY: ${maskKey(falInfo.value)} (${falInfo.source}) ✓` : "FAL_KEY: not configured");
      log(`Fonts: ${getFontDirectory()}`);
      return;
    }
    if (opts.clear) { clearConfig(); log("Keys cleared."); return; }
    if (opts.fal) { setConfigValue("fal_key", opts.fal); log(`FAL key saved: ${maskKey(opts.fal)}`); return; }

    // Interactive
    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));
    const falKey = await ask("FAL API key: ");
    if (falKey.trim()) { setConfigValue("fal_key", falKey.trim()); log(`FAL key saved: ${maskKey(falKey.trim())}`); }
    rl.close();
  });

// ─── CONFIG ──────────────────────────────────────────────
program
  .command("config")
  .description("Manage configuration")
  .argument("<action>", "set, get, or list")
  .argument("[key]", "Config key")
  .argument("[value]", "Config value")
  .action((action, key, value) => {
    switch (action) {
      case "set":
        if (!key || !value) { log("Usage: picture-it config set <key> <value>"); process.exit(1); }
        setConfigValue(key, value); log(`Set ${key} = ${value}`); break;
      case "get":
        if (!key) { log("Usage: picture-it config get <key>"); process.exit(1); }
        const val = getConfigValue(key);
        val ? console.log(val) : log(`${key} not set`); break;
      case "list": {
        const cfg = listConfig();
        for (const [k, v] of Object.entries(cfg)) {
          log(k.includes("key") ? `${k}: ${maskKey(v as string)}` : `${k}: ${v}`);
        } break;
      }
      default: log(`Unknown: ${action}. Use set, get, or list.`); process.exit(1);
    }
  });

program.parse();
