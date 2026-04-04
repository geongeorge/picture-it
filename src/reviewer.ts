import { query } from "@anthropic-ai/claude-agent-sdk";
import type { CompositionPlan, ReviewResult } from "./types.ts";

function log(msg: string) {
  process.stderr.write(`[picture-it] ${msg}\n`);
}

export async function reviewImage(opts: {
  imagePath: string;
  originalPrompt: string;
  plan: CompositionPlan;
  verbose?: boolean;
}): Promise<ReviewResult> {
  const textInScene = opts.plan.falStep?.textInScene || [];

  if (opts.verbose) log("Sending image to Claude reviewer via Agent SDK...");

  const prompt = `Review the generated image at "${opts.imagePath}". Read it first.

The original prompt was:
"${opts.originalPrompt}"

The plan specified these text elements to be rendered in the scene by FAL:
${textInScene.length > 0 ? textInScene.map((t) => `- "${t}"`).join("\n") : "(none)"}

Score 1-10 on each:
1. Composition and visual balance
2. Text readability (all text, both overlaid and in-scene)
3. Asset placement accuracy
4. Color harmony
5. Overall quality and prompt match
6. FAL text accuracy: do the textInScene strings match what's visible? Check for misspellings, warping, missing text.

Return JSON only, no markdown fences:
{
  "score": <average>,
  "composition": <1-10>,
  "textReadability": <1-10>,
  "assetPlacement": <1-10>,
  "colorHarmony": <1-10>,
  "overallQuality": <1-10>,
  "falTextAccuracy": <1-10>,
  "corrections": {
    "retryFal": <boolean>,
    "correctedFalPrompt": "<improved prompt if retryFal>",
    "modelUpgrade": "<model name if upgrade needed>"
  }
}`;

  let resultText = "";

  for await (const message of query({
    prompt,
    options: {
      allowedTools: ["Read"],
      model: "claude-sonnet-4-6",
      maxTurns: 3,
    },
  })) {
    if ("result" in message) {
      resultText = message.result;
    }
  }

  let json = resultText.trim();
  if (json.startsWith("```")) {
    json = json.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  // Extract JSON from surrounding text if needed
  const jsonMatch = json.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    json = jsonMatch[0];
  }

  try {
    return JSON.parse(json) as ReviewResult;
  } catch {
    log(`Failed to parse reviewer output, defaulting to score 7`);
    return {
      score: 7,
      composition: 7,
      textReadability: 7,
      assetPlacement: 7,
      colorHarmony: 7,
      overallQuality: 7,
      falTextAccuracy: 7,
    };
  }
}
