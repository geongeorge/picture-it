import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  CompositionPlan,
  AssetAnalysis,
  FalModel,
  ColorGrade,
} from "./types.ts";
import { PLATFORM_PRESETS, STYLE_PRESETS } from "./presets.ts";
import { formatAnalysis } from "./assets.ts";

function log(msg: string) {
  process.stderr.write(`[picture-it] ${msg}\n`);
}

const SYSTEM_PROMPT = `You are an expert graphic designer and image compositor powering a CLI tool
called picture-it. You receive a description of a desired image, analyzed
input assets, and constraints. You output a JSON composition plan.

Design principles you follow:

1. Every image has exactly one focal point that draws the eye first.
2. Visual hierarchy: one element dominates, others support.
3. Text is always readable. Use textShadow and gradient overlays.
4. Colors harmonize with the input assets dominant palette.
5. Less is more. Dark/white space gives elements room to breathe.
6. Consistent lighting and shadow direction.
7. Shadows create depth, not decoration.
8. Max 2 font families per image.
9. Important elements are large, supporting elements are small.
10. Elements align to composition zones, not random positions.

MODEL SELECTION (optimize for cost, upgrade only when needed):
Default to SeedDream ($0.04) for most tasks. It handles basic composition,
product swaps, and background generation well.
Upgrade to Nano Banana 2 ($0.08) when you need: >10 input images,
extreme aspect ratios, faster speed, thinking mode for complex reasoning,
or web search grounding.
Upgrade to Nano Banana Pro ($0.15) only when: text must look perfect
inside the scene, character consistency across people matters, or the
edit requires deep multi-step compositional reasoning.
Always include your reasoning for the model choice in the plan.

TEXT ROUTING (decide per text element, three strategies):

renderer: "satori-to-fal" — BEST for hero/prominent text
Pre-render text with Satori as transparent PNG.
Pass PNG as input image to FAL, reference as "Figure N" in prompt.
FAL integrates it into the scene with natural lighting and perspective.
Use for: hero titles, brand names, stylized headings.

renderer: "fal-direct"
Text only in FAL prompt, model renders from scratch.
Track in textInScene for reviewer to verify.
Use for: short simple words, product labels, text on signs.

renderer: "satori-overlay"
Satori renders, Sharp composites flat on top after FAL.
Use for: UI text, subtitles, watermarks, badges, captions.

Available zones: hero-center (50%,45%), title-area (50%,75%), top-bar (50%,8%),
bottom-bar (50%,92%), left-third (25%,50%), right-third (75%,50%),
top-left-safe (15%,12%), top-right-safe (85%,12%),
bottom-left-safe (15%,88%), bottom-right-safe (85%,88%),
center-left (30%,50%), center-right (70%,50%).

Available depth layers: background, midground, foreground, overlay, frame.
Shadows auto-scale with depth.

Satori CSS subset: display:flex, flexDirection, alignItems, justifyContent,
flexWrap, gap, width, height, margin, padding, position, border, borderRadius,
fontSize, fontFamily, fontWeight, color, backgroundColor, backgroundImage
(linear-gradient only), textAlign, letterSpacing, lineHeight, textShadow,
opacity, overflow:hidden, backgroundClip:text.

Satori does NOT support: display:grid, transforms, animations, pseudo-elements,
box-shadow, filters.

Output ONLY valid JSON matching the CompositionPlan schema. No markdown fences.`;

export async function planImage(opts: {
  prompt: string;
  assets: AssetAnalysis[];
  width: number;
  height: number;
  style?: string;
  preset?: string;
  platform?: string;
  model?: FalModel;
  grade?: ColorGrade;
  removeBg?: boolean;
  noFal?: boolean;
  grain?: boolean;
  vignette?: boolean;
  verbose?: boolean;
}): Promise<CompositionPlan> {
  const platformPreset = opts.platform
    ? PLATFORM_PRESETS[opts.platform]
    : undefined;
  const stylePreset = opts.preset ? STYLE_PRESETS[opts.preset] : undefined;

  let userPrompt = `Create a composition plan for the following image:

DESCRIPTION: ${opts.prompt}
DIMENSIONS: ${opts.width}x${opts.height}`;

  if (opts.assets.length > 0) {
    userPrompt += `\n\nINPUT ASSETS:\n${opts.assets.map(formatAnalysis).join("\n")}`;
  }

  if (opts.style) {
    userPrompt += `\n\nSTYLE KEYWORDS: ${opts.style}`;
  }

  if (stylePreset) {
    userPrompt += `\n\nSTYLE PRESET (${opts.preset}):
FAL prompt style: ${stylePreset.falPromptStyle}
Font: ${stylePreset.font}
Default grade: ${stylePreset.defaultGrade}`;
  }

  if (platformPreset) {
    userPrompt += `\n\nPLATFORM (${opts.platform}):
Size: ${platformPreset.width}x${platformPreset.height}
Safe zone: ${platformPreset.safeZone}
${platformPreset.minHeading ? `Min heading size: ${platformPreset.minHeading}px` : ""}
${platformPreset.notes || ""}`;
  }

  if (opts.model) {
    userPrompt += `\n\nFORCED MODEL: ${opts.model}`;
  }

  if (opts.noFal) {
    userPrompt += `\n\nNO FAL: Generate without AI image generation. Use CSS gradient background.
Set falStep.skip = true and provide a fallbackBg gradient.`;
  }

  if (opts.removeBg) {
    userPrompt += `\n\nREMOVE BACKGROUNDS: Remove backgrounds from all input assets.`;
  }

  if (opts.grade) {
    userPrompt += `\n\nCOLOR GRADE: ${opts.grade}`;
  }

  if (opts.grain) userPrompt += `\n\nGRAIN: enabled`;
  if (opts.vignette) userPrompt += `\n\nVIGNETTE: enabled`;

  userPrompt += `\n\nReturn the JSON plan. Remember: width=${opts.width}, height=${opts.height}.
Be concise — minimize string lengths in reasoning fields. Keep the JSON compact.`;

  if (opts.verbose) log("Calling Claude planner via Agent SDK...");

  let resultText = "";

  for await (const message of query({
    prompt: userPrompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      allowedTools: [],
      model: "claude-sonnet-4-6",
      maxTurns: 1,
    },
  })) {
    if ("result" in message) {
      resultText = message.result;
    }
  }

  // Extract JSON from result (may be wrapped in markdown fences or surrounding text)
  let json = resultText.trim();

  // Strip markdown fences
  if (json.includes("```")) {
    const fenceMatch = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) json = fenceMatch[1]!;
  }

  // Try to find a JSON object in the text
  if (!json.startsWith("{")) {
    const jsonStart = json.indexOf("{");
    if (jsonStart >= 0) {
      json = json.slice(jsonStart);
    }
  }

  // Find matching closing brace
  if (json.startsWith("{")) {
    let depth = 0;
    let end = -1;
    for (let i = 0; i < json.length; i++) {
      if (json[i] === "{") depth++;
      else if (json[i] === "}") {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end > 0) json = json.slice(0, end + 1);
  }

  try {
    const plan = JSON.parse(json) as CompositionPlan;
    plan.width = opts.width;
    plan.height = opts.height;
    if (opts.grain !== undefined) plan.grain = opts.grain;
    if (opts.vignette !== undefined) plan.vignette = opts.vignette;
    if (opts.grade) plan.colorGrade = opts.grade;
    return plan;
  } catch (e) {
    log(`Failed to parse planner output: ${(e as Error).message}`);
    log(`Raw output: ${resultText.slice(0, 500)}`);
    throw new Error("Planner returned invalid JSON");
  }
}
