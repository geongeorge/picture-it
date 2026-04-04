#!/usr/bin/env bun
import { Command } from "commander";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { getConfig, setConfigValue, getConfigValue, listConfig, clearConfig, maskKey, getKeySource } from "./src/config.ts";
import { analyzeAssets } from "./src/assets.ts";
import { planImage } from "./src/planner.ts";
import { executePipeline, createGradientBackground } from "./src/pipeline.ts";
import { composite } from "./src/compositor.ts";
import { applyColorGrade, applyGrain, applyVignette, finalizeOutput } from "./src/postprocess.ts";
import { reviewImage } from "./src/reviewer.ts";
import { getTemplate } from "./src/templates/index.ts";
import { checkAndFixContrast } from "./src/contrast.ts";
import { PLATFORM_PRESETS } from "./src/presets.ts";
import type { CompositionPlan, Overlay, FalModel, ColorGrade, BatchEntry } from "./src/types.ts";

function log(msg: string) {
  process.stderr.write(`[picture-it] ${msg}\n`);
}

const program = new Command();

program
  .name("picture-it")
  .description("AI-powered image generation and compositing CLI")
  .version("0.1.0");

// --- CREATE command ---
program
  .command("create")
  .description("Generate an image using AI planning and compositing")
  .requiredOption("--prompt <text>", "Image description")
  .option("--assets <files...>", "Input asset images", [])
  .option("--style <keywords>", "Style keywords (comma-separated)")
  .option("--preset <name>", "Style preset (dark-tech, minimal-light, etc.)")
  .option("--platform <name>", "Platform preset (blog-featured, og-image, etc.)")
  .option("--size <WxH>", "Output dimensions (e.g. 1200x630)")
  .option("--output <path>", "Output file path", "output.png")
  .option("--model <name>", "FAL model override (seedream, banana2, banana-pro)")
  .option("--remove-bg", "Force background removal on all assets")
  .option("--review", "Enable Claude Vision review loop")
  .option("--grain", "Add film grain")
  .option("--vignette", "Add edge vignette")
  .option("--grade <name>", "Color grade (cinematic, moody, vibrant, clean, warm-editorial, cool-tech)")
  .option("--no-fal", "Skip FAL generation, use gradient background")
  .option("--bg <path>", "Pre-made background image (skips FAL)")
  .option("--verbose", "Detailed progress output")
  .action(async (opts) => {
    const config = getConfig();

    // Resolve dimensions
    let width = 1200;
    let height = 630;

    if (opts.platform && PLATFORM_PRESETS[opts.platform]) {
      width = PLATFORM_PRESETS[opts.platform]!.width;
      height = PLATFORM_PRESETS[opts.platform]!.height;
    }

    if (opts.size) {
      const [w, h] = opts.size.split("x").map(Number);
      if (w && h) {
        width = w;
        height = h;
      }
    }

    const assetDir = process.cwd();
    const assetPaths = (opts.assets as string[]).map((a: string) =>
      path.resolve(assetDir, a)
    );

    // Validate assets exist
    for (const ap of assetPaths) {
      if (!fs.existsSync(ap)) {
        log(`Asset not found: ${ap}`);
        process.exit(1);
      }
    }

    if (opts.bg && !fs.existsSync(opts.bg)) {
      log(`Background image not found: ${opts.bg}`);
      process.exit(1);
    }

    // Anthropic key is optional — the SDK can resolve it from env/config automatically

    // Analyze assets
    if (opts.verbose) log("Analyzing assets...");
    const analyses = assetPaths.length > 0
      ? await analyzeAssets(assetPaths)
      : [];

    // Plan
    if (opts.verbose) log("Planning composition...");
    let plan: CompositionPlan;
    try {
      plan = await planImage({
        prompt: opts.prompt,
        assets: analyses,
        width,
        height,
        style: opts.style,
        preset: opts.preset,
        platform: opts.platform,
        model: opts.model as FalModel,
        grade: opts.grade as ColorGrade,
        removeBg: opts.removeBg,
        noFal: !opts.fal || !!opts.bg,
        grain: opts.grain,
        vignette: opts.vignette,
        verbose: opts.verbose,
      });
    } catch (e) {
      log(`Planning failed: ${(e as Error).message}`);
      log("Falling back to default layout...");
      plan = createFallbackPlan(width, height, opts);
    }

    if (opts.bg) {
      plan.falStep.skip = true;
    }

    // Execute pipeline
    const outputPath = path.resolve(opts.output);
    let finalPath: string;

    if (opts.bg) {
      const bgBuffer = await sharp(path.resolve(opts.bg))
        .resize(width, height, { fit: "cover" })
        .png()
        .toBuffer();

      const fixedOverlays = await checkAndFixContrast(bgBuffer, plan.overlays, width, height);
      plan.overlays = fixedOverlays;

      let result = await composite(plan, bgBuffer, assetDir, opts.verbose);

      if (plan.colorGrade) result = await applyColorGrade(result, plan.colorGrade);
      if (plan.grain) result = await applyGrain(result);
      if (plan.vignette) result = await applyVignette(result);

      await finalizeOutput(result, outputPath);
      finalPath = outputPath;
    } else {
      finalPath = await executePipeline({
        plan,
        assetDir,
        outputPath,
        falKey: config.fal_key,
        verbose: opts.verbose,
      });
    }

    // Review loop
    if (opts.review) {
      let totalCost = 0;
      const maxRetries = 2;

      for (let i = 0; i < maxRetries; i++) {
        if (opts.verbose) log(`Review iteration ${i + 1}/${maxRetries}...`);

        const review = await reviewImage({
          imagePath: finalPath,
          originalPrompt: opts.prompt,
          plan,
          verbose: opts.verbose,
        });

        log(`Review score: ${review.score}/10`);

        if (review.score >= 7) {
          if (opts.verbose) log("Review passed!");
          break;
        }

        if (review.corrections?.retryFal && review.corrections.correctedFalPrompt) {
          plan.falStep.prompt = review.corrections.correctedFalPrompt;
          if (review.corrections.modelUpgrade) {
            plan.falStep.model = review.corrections.modelUpgrade;
          }
        }

        finalPath = await executePipeline({
          plan,
          assetDir,
          outputPath,
          falKey: config.fal_key,
          verbose: opts.verbose,
        });

        totalCost += parseFloat(plan.falStep.estimatedCost || "0.04");
        if (totalCost > 0.5) {
          log("Cost guard: exceeded $0.50. Stopping retries.");
          break;
        }
      }
    }

    console.log(finalPath);
  });

// --- COMPOSE command ---
program
  .command("compose")
  .description("Composite overlays onto a background image")
  .requiredOption("--bg <path>", "Background image path")
  .requiredOption("--overlays <path>", "Overlays JSON file path")
  .option("--size <WxH>", "Output dimensions")
  .option("--output <path>", "Output file path", "output.png")
  .option("--grade <name>", "Color grade")
  .option("--grain", "Add film grain")
  .option("--vignette", "Add vignette")
  .option("--verbose", "Detailed output")
  .action(async (opts) => {
    const bgPath = path.resolve(opts.bg);
    const overlaysPath = path.resolve(opts.overlays);

    if (!fs.existsSync(bgPath)) {
      log(`Background not found: ${bgPath}`);
      process.exit(1);
    }
    if (!fs.existsSync(overlaysPath)) {
      log(`Overlays file not found: ${overlaysPath}`);
      process.exit(1);
    }

    const bgMeta = await sharp(bgPath).metadata();
    let width = bgMeta.width || 1200;
    let height = bgMeta.height || 630;

    if (opts.size) {
      const [w, h] = opts.size.split("x").map(Number);
      if (w && h) { width = w; height = h; }
    }

    const overlays: Overlay[] = JSON.parse(fs.readFileSync(overlaysPath, "utf-8"));

    const plan: CompositionPlan = {
      width,
      height,
      falStep: { model: "seedream", prompt: "", sizeStrategy: { width, height }, skip: true },
      overlays,
      colorGrade: opts.grade as ColorGrade,
      grain: opts.grain,
      vignette: opts.vignette,
    };

    const bgBuffer = await sharp(bgPath)
      .resize(width, height, { fit: "cover" })
      .png()
      .toBuffer();

    let result = await composite(plan, bgBuffer, process.cwd(), opts.verbose);

    if (plan.colorGrade) result = await applyColorGrade(result, plan.colorGrade);
    if (plan.grain) result = await applyGrain(result);
    if (plan.vignette) result = await applyVignette(result);

    const outputPath = path.resolve(opts.output);
    await finalizeOutput(result, outputPath);
    console.log(outputPath);
  });

// --- TEMPLATE command ---
program
  .command("template <name>")
  .description("Generate from a built-in template (no AI)")
  .option("--platform <name>", "Platform preset", "blog-featured")
  .option("--size <WxH>", "Output dimensions")
  .option("--output <path>", "Output file path", "output.png")
  .option("--grade <name>", "Color grade")
  .option("--grain", "Add film grain")
  .option("--vignette", "Add vignette")
  .option("--verbose", "Detailed output")
  .option("--left-logo <path>", "Left logo (vs-comparison)")
  .option("--right-logo <path>", "Right logo (vs-comparison)")
  .option("--logo <path>", "Logo asset")
  .option("--title <text>", "Title text")
  .option("--subtitle <text>", "Subtitle text")
  .option("--badge <text>", "Badge text")
  .option("--glow-color <hex>", "Glow color")
  .option("--vs-text <text>", "VS text (vs-comparison)")
  .option("--left-label <text>", "Left label (vs-comparison)")
  .option("--right-label <text>", "Right label (vs-comparison)")
  .option("--text-color <color>", "Text color")
  .option("--background <css>", "CSS gradient background")
  .option("--site-name <text>", "Site name (social-card)")
  .option("--author-name <text>", "Author name (social-card)")
  .option("--description <text>", "Description (social-card)")
  .option("--position <pos>", "Position: left, center, right")
  .action(async (name, opts) => {
    const tmpl = getTemplate(name);
    if (!tmpl) {
      log(`Unknown template: ${name}`);
      log(`Available: vs-comparison, feature-hero, text-hero, social-card`);
      process.exit(1);
    }

    let width = 1200;
    let height = 630;

    if (opts.platform && PLATFORM_PRESETS[opts.platform]) {
      width = PLATFORM_PRESETS[opts.platform]!.width;
      height = PLATFORM_PRESETS[opts.platform]!.height;
    }

    if (opts.size) {
      const [w, h] = opts.size.split("x").map(Number);
      if (w && h) { width = w; height = h; }
    }

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(opts)) {
      if (value !== undefined && typeof value !== "function") {
        const camelKey = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        data[camelKey] = value;
      }
    }

    const result = tmpl(data, width, height);

    const bgBuffer = await createGradientBackground(result.background, width, height);

    const plan: CompositionPlan = {
      width,
      height,
      falStep: { model: "seedream", prompt: "", sizeStrategy: { width, height }, skip: true },
      overlays: result.overlays,
      colorGrade: opts.grade as ColorGrade,
      grain: opts.grain,
      vignette: opts.vignette,
    };

    let output = await composite(plan, bgBuffer, process.cwd(), opts.verbose);

    if (plan.colorGrade) output = await applyColorGrade(output, plan.colorGrade);
    if (plan.grain) output = await applyGrain(output);
    if (plan.vignette) output = await applyVignette(output);

    const outputPath = path.resolve(opts.output);
    await finalizeOutput(output, outputPath);
    console.log(outputPath);
  });

// --- BATCH command ---
program
  .command("batch")
  .description("Generate multiple images from a JSON spec")
  .requiredOption("--spec <path>", "Batch spec JSON file")
  .option("--output-dir <dir>", "Output directory", ".")
  .option("--verbose", "Detailed output")
  .action(async (opts) => {
    const specPath = path.resolve(opts.spec);
    if (!fs.existsSync(specPath)) {
      log(`Spec file not found: ${specPath}`);
      process.exit(1);
    }

    const config = getConfig();
    const entries: BatchEntry[] = JSON.parse(fs.readFileSync(specPath, "utf-8"));
    const outputDir = path.resolve(opts.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });

    const results: string[] = [];

    for (const entry of entries) {
      const outputPath = path.resolve(outputDir, `${entry.id}.png`);

      if (entry.mode === "template" && entry.template) {
        const tmpl = getTemplate(entry.template);
        if (!tmpl) {
          log(`Unknown template: ${entry.template}, skipping ${entry.id}`);
          continue;
        }

        let w = 1200, h = 630;
        if (entry.platform && PLATFORM_PRESETS[entry.platform]) {
          w = PLATFORM_PRESETS[entry.platform]!.width;
          h = PLATFORM_PRESETS[entry.platform]!.height;
        }

        const result = tmpl(entry.templateData || {}, w, h);
        const bgBuffer = await createGradientBackground(result.background, w, h);

        const plan: CompositionPlan = {
          width: w,
          height: h,
          falStep: { model: "seedream", prompt: "", sizeStrategy: { width: w, height: h }, skip: true },
          overlays: result.overlays,
        };

        const output = await composite(plan, bgBuffer, process.cwd(), opts.verbose);
        await finalizeOutput(output, outputPath);
      } else if (entry.mode === "create" && entry.prompt) {
        let w = 1200, h = 630;
        if (entry.platform && PLATFORM_PRESETS[entry.platform]) {
          w = PLATFORM_PRESETS[entry.platform]!.width;
          h = PLATFORM_PRESETS[entry.platform]!.height;
        }
        if (entry.size) {
          const [ew, eh] = entry.size.split("x").map(Number);
          if (ew && eh) { w = ew; h = eh; }
        }

        const assetPaths = (entry.assets || []).map((a) => path.resolve(a));
        const analyses = assetPaths.length > 0 ? await analyzeAssets(assetPaths) : [];

        const plan = await planImage({
          prompt: entry.prompt,
          assets: analyses,
          width: w,
          height: h,
          style: entry.style,
          verbose: opts.verbose,
        });

        await executePipeline({
          plan,
          assetDir: process.cwd(),
          outputPath,
          falKey: config.fal_key,
          verbose: opts.verbose,
        });
      } else if (entry.mode === "compose" && entry.bg) {
        const bgBuffer = await sharp(path.resolve(entry.bg)).png().toBuffer();
        const meta = await sharp(bgBuffer).metadata();
        const w = meta.width || 1200;
        const h = meta.height || 630;

        const plan: CompositionPlan = {
          width: w,
          height: h,
          falStep: { model: "seedream", prompt: "", sizeStrategy: { width: w, height: h }, skip: true },
          overlays: entry.overlays || [],
        };

        const output = await composite(plan, bgBuffer, process.cwd(), opts.verbose);
        await finalizeOutput(output, outputPath);
      }

      results.push(outputPath);
      if (opts.verbose) log(`Generated: ${outputPath}`);
    }

    console.log(JSON.stringify(results));
  });

// --- AUTH command ---
program
  .command("auth")
  .description("Configure API keys")
  .option("--fal <key>", "Set FAL API key")
  .option("--anthropic <key>", "Set Anthropic API key")
  .option("--status", "Show key status")
  .option("--clear", "Remove all keys")
  .action(async (opts) => {
    if (opts.status) {
      const falInfo = getKeySource("fal_key");
      const anthropicInfo = getKeySource("anthropic_api_key");

      if (falInfo) {
        log(`FAL_KEY: ${maskKey(falInfo.value)} (${falInfo.source}) ✓`);
      } else {
        log(`FAL_KEY: not configured`);
      }

      if (anthropicInfo) {
        log(`ANTHROPIC_API_KEY: ${maskKey(anthropicInfo.value)} (${anthropicInfo.source}) ✓`);
      } else {
        log(`ANTHROPIC_API_KEY: not configured`);
      }
      return;
    }

    if (opts.clear) {
      clearConfig();
      log("All keys cleared from config.");
      return;
    }

    if (opts.fal) {
      setConfigValue("fal_key", opts.fal);
      log(`FAL key saved: ${maskKey(opts.fal)}`);
    }

    if (opts.anthropic) {
      setConfigValue("anthropic_api_key", opts.anthropic);
      log(`Anthropic key saved: ${maskKey(opts.anthropic)}`);
    }

    if (!opts.fal && !opts.anthropic) {
      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr,
      });

      const ask = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

      const falKey = await ask("FAL API key (enter to skip): ");
      if (falKey.trim()) {
        setConfigValue("fal_key", falKey.trim());
        log(`FAL key saved: ${maskKey(falKey.trim())}`);
      }

      const anthropicKey = await ask("Anthropic API key (enter to skip): ");
      if (anthropicKey.trim()) {
        setConfigValue("anthropic_api_key", anthropicKey.trim());
        log(`Anthropic key saved: ${maskKey(anthropicKey.trim())}`);
      }

      rl.close();
    }
  });

// --- CONFIG command ---
program
  .command("config")
  .description("Manage configuration")
  .argument("<action>", "set, get, or list")
  .argument("[key]", "Config key")
  .argument("[value]", "Config value")
  .action((action, key, value) => {
    switch (action) {
      case "set":
        if (!key || !value) {
          log("Usage: picture-it config set <key> <value>");
          process.exit(1);
        }
        setConfigValue(key, value);
        log(`Set ${key} = ${value}`);
        break;
      case "get":
        if (!key) {
          log("Usage: picture-it config get <key>");
          process.exit(1);
        }
        const val = getConfigValue(key);
        if (val) {
          console.log(val);
        } else {
          log(`${key} not set`);
        }
        break;
      case "list": {
        const cfg = listConfig();
        for (const [k, v] of Object.entries(cfg)) {
          if (k.includes("key")) {
            log(`${k}: ${maskKey(v as string)}`);
          } else {
            log(`${k}: ${v}`);
          }
        }
        break;
      }
      default:
        log(`Unknown action: ${action}. Use set, get, or list.`);
        process.exit(1);
    }
  });

program.parse();

function createFallbackPlan(
  width: number,
  height: number,
  opts: any
): CompositionPlan {
  return {
    width,
    height,
    falStep: {
      model: "seedream",
      prompt: opts.prompt || "",
      sizeStrategy: { width, height },
      skip: true,
      fallbackBg: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      reasoning: "Fallback plan due to planner failure",
    },
    overlays: [],
    colorGrade: opts.grade as ColorGrade,
    grain: opts.grain,
    vignette: opts.vignette,
  };
}
