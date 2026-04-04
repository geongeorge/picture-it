PROJECT: picture-it

A CLI tool for AI agents to generate production-quality images.
Uses FAL AI models for creative image generation and editing,
Satori for pixel-perfect text rendering, and Sharp for compositing
and post-processing. No headless browser. Five core dependencies.

Think of it as a programmatic Photoshop that an AI agent can invoke
from the command line to produce blog headers, social cards, product
shots, comparison graphics, and marketing images.

RUNTIME AND STACK

- Bun as runtime
- TypeScript
- Commander.js for CLI
- @anthropic-ai/sdk for the AI planner brain and vision reviewer (Claude Sonnet)
- @fal-ai/client for image generation, editing, and background removal
- sharp for image compositing, resizing, cropping, color grading, post-processing
- satori for JSX-to-SVG rendering (text, badges, labels, layout elements)
- @resvg/resvg-js for SVG-to-PNG conversion (pairs with Satori)
- dotenv for .env file fallback (project-level overrides)
  Keys resolve in order: env vars > ~/.picture-it/config.json > .env

No headless browser. No Playwright. No @napi-rs/canvas.
Satori + resvg-js handles all text/vector rendering.
Sharp handles all image compositing and manipulation.
FAL handles all creative AI image generation.
Claude handles all planning and quality review.

CORE CONCEPT: THREE-TIER PIPELINE

Tier 1 — FAL (Creative AI)
Generates backgrounds, composes assets into scenes, removes backgrounds.
Handles everything that needs to look "natural" — lighting, shadows,
atmosphere, scene composition, product photography.
AI image models excel at this.

Tier 2 — Satori + Sharp (Precise Overlay)
Renders text, badges, logos, watermarks, shapes, gradient overlays.
Handles everything that needs pixel-perfect precision.
Used when text must be crisp and exact (UI labels, watermarks, small text).

Tier 3 — Sharp (Post-Processing)
Composites all layers together, applies color grading, grain, vignette,
resizes to exact output dimensions, converts to final format.

TEXT RENDERING: THREE STRATEGIES (planner picks per text element)

The planner decides per text element which strategy to use.

STRATEGY 1: SATORI → FAL (scene-integrated, accurate) ★ PREFERRED FOR HERO TEXT
Satori pre-renders the text as a crisp transparent PNG.
That PNG is passed as an input image to the FAL edit model.
The FAL prompt references it: "integrate the text from Figure N
into the scene at the top, matching the lighting and style."

    Result: pixel-perfect letterforms with natural scene integration.
    The text gets proper lighting, shadows, color harmony, and perspective
    from FAL, but the actual characters are accurate because Satori
    rendered them — not hallucinated by the image model.

    Use for: hero titles, brand names, stylized headings, any text
    that should feel like it belongs IN the scene rather than ON TOP of it.

    Pipeline: Satori JSX → SVG → resvg-js PNG → upload to FAL storage
    → include in image_urls → reference in FAL prompt as "Figure N"

STRATEGY 2: FAL DIRECT (scene-integrated, no pre-render)
Text instructions only live in the FAL prompt.
The model renders the text from scratch.
Works well for simple short words, product labels, signs.
Risky for longer text or precise typography.
Cheapest since no extra Satori step.

    Use for: short brand names on products, text on signs/walls,
    cases where approximate text is acceptable, or when the text
    is already visible in a reference image being edited.

STRATEGY 3: SATORI OVERLAY (crisp, flat, composited after FAL)
Satori renders text as PNG. Sharp composites it ON TOP of the
FAL output as a flat overlay layer.
Pixel-perfect but sits "above" the image — no scene integration.

    Use for: clean UI text, subtitles, captions, badges, watermarks,
    legal text, text that should look like a design overlay rather
    than part of the photographed scene, small text that needs to
    stay sharp at all sizes.

A single image can use all three: - Strategy 1 for the hero title "Hype Discounts" integrated into the scene - Strategy 2 for a brand name already on a product in a reference photo - Strategy 3 for a small "astralcommerce.com" watermark in the corner

The planner marks each text element with:
renderer: "satori-to-fal" | "fal-direct" | "satori-overlay"

For satori-to-fal: the text appears in both the Satori pre-render step
AND in the falStep.inputImages (as an uploaded PNG). The falStep.prompt
references it by figure number. The planner must coordinate the figure
numbering across all input images (assets + pre-rendered text PNGs).

For fal-direct: text instructions are in falStep.prompt only.
Track in falStep.textInScene for reviewer verification.

For satori-overlay: text appears only in the overlays array as
type "satori-text" and is composited by Sharp after FAL output.

EXACT SIZE HANDLING

Each FAL model handles sizing differently. The goal is always to output
the exact requested dimensions with zero stretching or distortion.

SEEDREAM ($0.04) — Best for exact sizes
Supports custom { width, height } directly via image_size param.
Range: 1920-4096px per axis, total pixels between 2560x1440 and 4096x4096.
If target fits in range (e.g. 2048x1080), pass dimensions directly. Done.
If target is smaller than minimum (e.g. 1200x630):
Generate at auto_2K preset, then crop with Sharp to exact size.
This is another reason SeedDream is the default — less post-processing.

NANO BANANA 2 and PRO — Aspect ratio + resolution presets
Use aspect_ratio enum + resolution preset, then crop to exact size.
Map target to closest aspect_ratio:
1200x630 (1.9:1) -> "16:9" (1.78:1, closest standard)
1080x1080 -> "1:1"
1280x720 -> "16:9"
1080x1920 -> "9:16"
1500x500 (3:1) -> "21:9" (2.33:1) or "4:1" (Banana 2 only)
800x450 -> "16:9"
Map target to resolution:
Max dimension <= 512 -> "0.5K" (Banana 2 only, saves cost)
Max dimension <= 1024 -> "1K"
Max dimension <= 2048 -> "2K" (1.5x cost for Banana 2, 2x for Pro)
Max dimension > 2048 -> "4K" (2x cost)
Then crop to exact target:
sharp(falOutput).resize(targetWidth, targetHeight, {
fit: "cover",
position: focalPoint || "attention"
})

FLUX (generation only, no input images)
Similar to Banana models — aspect ratio based, crop to exact size.

SHARP CROP STRATEGIES
fit:"cover" scales up to cover target area, crops overflow.
position options:
"attention" — Sharp's smart crop, keeps most visually interesting region
"entropy" — keeps highest detail region
"center" — simple center crop
Directional: "top", "bottom", "left", "right"
Exact: { left: 30, top: 40 } in percentages
The planner specifies focalPoint based on where key content is.

For blend layers: generate at same settings as base, crop same way.

Result: picture-it always outputs exactly the requested dimensions.

PIPELINE DETAIL: CREATE MODE

STAGE 0: ASSET ANALYSIS (pre-planner)
Before calling the planner, analyze all input assets automatically:

For each asset, extract with Sharp:

- Dimensions and aspect ratio (square = icon, landscape = screenshot, etc.)
- Has transparency (check alpha channel via sharp.stats())
- Dominant color palette:
  sharp(asset).resize(8, 8).raw().toBuffer() gives 64 pixels
  Cluster into 3-5 dominant colors
  Also sharp(asset).stats() for per-channel mean
- Content type estimation based on heuristics:
  Square + transparency = app icon/logo
  Wide rectangle + no transparency = screenshot
  Small square = avatar
  Lots of edge transparency = cutout graphic/logo

Pass this analysis to the planner as context:
"hype-logo.png: 512x512 square, has transparency, likely app icon,
dominant colors: #7c3aed (vibrant purple), #1a1a2e (dark navy), #ffffff (white)"
"screenshot.png: 1920x1080 landscape, no transparency, likely screenshot,
dominant colors: #f5f5f5 (light gray), #3b82f6 (blue), #1a1a1a (near black)"

This helps the planner:

- Harmonize background/glow colors with asset palettes
- Choose appropriate treatments (icons get glow, screenshots get device frames)
- Size elements proportionally (dont stretch a square logo to fill a wide area)

STAGE 1: PLAN (Claude Sonnet)
Input: user prompt, asset analysis, style keywords, preset, target platform/size
Output: JSON plan

The planner outputs:

falStep:
model: "seedream" | "banana2" | "banana-pro" | "flux-dev" | "flux-schnell"
prompt: text prompt for FAL. Can include text rendering instructions
if the planner decides certain text should be baked into the scene
(e.g. "place the brand name 'Hype' on the product in stylized lettering").
Text that needs to be pixel-perfect goes in the overlays instead.
inputImages: which asset paths to send to FAL (for edit models)
textInScene: array of text strings the FAL prompt asks to render
(tracked so the reviewer can verify them in the output)
removeBackgrounds: which assets need bg removal via birefnet first
resolution: "0.5K" | "1K" | "2K" | "4K" (model dependent)
sizeStrategy: how to get exact output dimensions
For seedream: { width, height } passed directly if in range
For banana2/pro: { aspectRatio, resolution } then crop with Sharp
focalPoint: where to center crop ("center", "attention", or {left:%, top:%})
skip: true if no FAL generation needed (solid color or gradient only)
fallbackBg: CSS-style gradient string to use if FAL fails
estimatedCost: "$0.04" | "$0.08" | "$0.15" (logged to stderr)
reasoning: brief string explaining why this model was chosen
(helps debugging, e.g. "seedream: simple bg + 2 logos, no complex text")

blendLayers: (optional, array)
Each: { prompt, aspectRatio, opacity, blend: "screen"|"overlay"|"multiply" }
Additional FAL-generated textures composited onto the base
Requests fire in parallel with the main falStep

overlays: array of overlay objects, each with a depth layer assignment
Sorted by depth then by array order within each depth level

    depth values: "background" | "midground" | "foreground" | "overlay" | "frame"
    Shadows auto-scale with depth:
      midground: blur 10px, offset 4px, opacity 0.2
      foreground: blur 20px, offset 8px, opacity 0.3

    Overlay types:

    type: "image"
      src: asset filename
      zone: named zone (preferred) or raw {x, y} in pixels/percentages
      width, height: pixels or percentage of canvas
      anchor: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right"
      opacity: 0-1
      borderRadius: pixels
      shadow: { blur, color, offsetX, offsetY } or "auto" (uses depth default)
      glow: { color, blur, spread } (colored blurred copy underneath)
      reflection: { opacity, fadeHeight } (flipped faded copy below)
      rotation: degrees
      mask: "circle" | "rounded" | "hexagon" | "diamond" | "blob" | custom polygon
      deviceFrame: "iphone" | "macbook" | "browser" | "ipad" (wraps in device mockup)
      depth: which depth layer

    type: "satori-text"
      jsx: Satori-compatible JSX tree describing the text layout
      zone: named zone or raw {x, y}
      width, height: text area bounds
      anchor: alignment
      opacity: 0-1
      depth: typically "overlay"

    type: "shape"
      shape: "rect" | "circle" | "line" | "arrow"
      Rendered as SVG string -> resvg-js -> PNG -> Sharp composite
      zone or raw position
      fill, stroke, borderRadius, opacity
      For arrows: from, to, headSize, curve
      depth: varies

    type: "gradient-overlay"
      gradient: linear-gradient or radial-gradient CSS definition
      opacity: 0-1
      blend: "normal" | "multiply" | "screen" | "overlay"
      Rendered via Satori (full-canvas div with backgroundImage)
      depth: typically "background" or "overlay"

    type: "watermark"
      src: asset filename
      position: "bottom-right" | "bottom-left" | "top-right" | "top-left"
      margin: pixels from edge
      opacity: 0.3 default
      size: pixels (max dimension)
      depth: "frame"

colorGrade: "cinematic" | "moody" | "vibrant" | "clean" | "warm-editorial" | "cool-tech"
grain: boolean
vignette: boolean

STAGE 1.5: SATORI PRE-RENDER (for satori-to-fal text)
Before calling FAL, render any text elements marked renderer: "satori-to-fal".

For each satori-to-fal text element: 1. Build JSX tree from the plan (same as satori-overlay, but styled for
scene integration — often white text on transparent bg, or styled text
that FAL will adapt to the scene's lighting) 2. Render with Satori → SVG → resvg-js → transparent PNG buffer 3. Save as a temporary file 4. This PNG becomes an additional input image for FAL

The planner coordinates figure numbering:
Figure 1: hype-logo.png (user asset)
Figure 2: competitor-logo.png (user asset)
Figure 3: pre-rendered-title.png (Satori output) ← auto-generated

    FAL prompt: "Create a dark tech scene with the logos from Figure 1 and
    Figure 2 side by side. Place the title text from Figure 3 at the top
    with dramatic lighting that matches the scene."

This step is skipped if no text uses the satori-to-fal strategy.
Output: array of pre-rendered text PNGs to include in FAL input images.

STAGE 2: FAL GENERATION
a) Upload ALL images to FAL storage (parallel):
This includes user assets + any pre-rendered text PNGs from Stage 1.5.
Use fal.storage.upload() for each. Run in parallel.

b) Background removal (if needed):
Call fal-ai/birefnet for each asset in removeBackgrounds (parallel)
Save transparent PNGs, these replace the original assets for compositing

c) Base image generation (model-specific API calls):

     If SeedDream ($0.04):
       await fal.subscribe("fal-ai/bytedance/seedream/v4.5/edit", {
         input: {
           prompt: plan.falStep.prompt,
           image_urls: uploadedUrls,
           image_size: plan.falStep.sizeStrategy,  // { width, height } or preset
           num_images: 1,
           max_images: 1,
         }
       })

     If Nano Banana 2 ($0.08):
       await fal.subscribe("fal-ai/nano-banana-2/edit", {
         input: {
           prompt: plan.falStep.prompt,
           image_urls: uploadedUrls,
           aspect_ratio: plan.falStep.sizeStrategy.aspectRatio,
           resolution: plan.falStep.sizeStrategy.resolution,
           output_format: "png",
           num_images: 1,
           limit_generations: true,
           thinking_level: plan.falStep.thinkingLevel || undefined,
           enable_web_search: plan.falStep.webSearch || false,
         }
       })

     If Nano Banana Pro ($0.15):
       await fal.subscribe("fal-ai/nano-banana-pro/edit", {
         input: {
           prompt: plan.falStep.prompt,
           image_urls: uploadedUrls,
           aspect_ratio: plan.falStep.sizeStrategy.aspectRatio,
           resolution: plan.falStep.sizeStrategy.resolution,
           output_format: "png",
           num_images: 1,
           enable_web_search: plan.falStep.webSearch || false,
         }
       })

     If generation model (flux-dev or flux-schnell):
       Call with text prompt only, no input images
       Download result

     If skip: create solid color or gradient canvas with Sharp

d) Download FAL output and resize/crop to exact target dimensions:
sharp(falOutput).resize(targetWidth, targetHeight, {
fit: "cover", position: plan.falStep.focalPoint || "attention"
})

e) Blend layers (if any):
Generate each in parallel with step (c) using same or different model
Resize each to target dimensions
Composite each onto the base with Sharp blend mode and opacity

f) Log cost to stderr:
"FAL: seedream @ $0.04 | 1 image | Total: $0.04"

Output: base image buffer at exact target dimensions with blend layers applied

STAGE 3: CONTRAST SAFETY CHECK
Before compositing text, check if text will be readable:

For each satori-text overlay: 1. Determine where on the base image the text will land 2. Crop that region from the base 3. Convert to grayscale, get mean luminance via sharp.stats() 4. Determine text color luminance from the JSX 5. Calculate contrast ratio 6. If contrast < 4.5:1 (WCAG AA):
Auto-inject a gradient-overlay behind the text zone
Dark bg: linear-gradient with rgba(0,0,0,0.5-0.7)
Light bg: linear-gradient with rgba(255,255,255,0.5-0.7)
Log warning to stderr: "Low contrast detected at [zone], added safety overlay"

This is automatic and runs even if the planner already added gradient overlays.
Belt and suspenders. Text is always readable.

STAGE 4: OVERLAY COMPOSITING
Sort all overlays by depth layer order:
background (0) -> midground (1) -> foreground (2) -> overlay (3) -> frame (4)
Within each depth, maintain array order from the plan.

Process each overlay:

For type "gradient-overlay":
Render via Satori: full-canvas div with backgroundImage CSS gradient
Satori -> SVG -> resvg-js -> PNG buffer
Sharp composite onto base with specified blend mode and opacity

For type "image":
Load asset with Sharp
If mask specified: create alpha mask shape, apply with Sharp composite dest-in
If deviceFrame specified:
Load bundled device frame PNG
Resize screenshot to fit device screen area
Composite screenshot into frame
Use the framed result as the asset
If borderRadius: create rounded rect mask, apply
If rotation: sharp.rotate(degrees)
Resize to specified width/height
If shadow or shadow="auto":
Create shadow: clone asset -> tint to shadow color -> blur -> composite at offset
If glow:
Create glow: clone asset -> tint to glow color -> extend canvas -> blur -> composite centered
If reflection:
Clone asset -> flip vertically -> apply gradient alpha mask (fade to transparent)
-> composite below the asset at reduced opacity
Composite the processed asset onto base at calculated position with opacity

For type "satori-text":
Feed the JSX tree to Satori with bundled fonts
Satori renders to SVG with correct flexbox layout
resvg-js converts SVG to PNG buffer (transparent background)
Composite onto base at calculated position with opacity

For type "shape":
Build SVG string for the shape (rect, circle, line, arrow path)
resvg-js converts to PNG
Composite onto base

For type "watermark":
Load asset, resize to specified size
Calculate position from corner + margin
Composite at low opacity

Output: fully composed image buffer

STAGE 5: POST-PROCESSING
Apply in order:

a) Color grading (if specified):

    cinematic:
      Slight teal shadows, warm highlights
      sharp.recomb([[1.05, 0, 0.05], [0, 1.1, 0], [0.05, 0, 1.15]])
      sharp.linear(1.1, -10)

    moody:
      Desaturated, crushed blacks
      sharp.modulate({ saturation: 0.8 })
      sharp.linear(1.15, 5)

    vibrant:
      Boosted saturation, warmth
      sharp.modulate({ saturation: 1.3 })

    clean:
      Slight sharpening only
      sharp.sharpen({ sigma: 0.5 })

    warm-editorial:
      Golden tones, slight desat
      sharp.tint with warm color at low blend
      sharp.modulate({ saturation: 0.9 })

    cool-tech:
      Blue shift, high contrast
      sharp.tint with cool color at low blend
      sharp.linear(1.2, -15)

b) Grain (if flag set):
Generate noise texture (Sharp: create raw buffer of random values)
Composite with "overlay" blend at 5-10% opacity

c) Vignette (if flag set):
Render radial gradient (dark edges, clear center) via Satori
Composite with "multiply" blend at 30-40% opacity

d) Format conversion and optimization:
sharp.png({ quality: 90 }) or .jpeg({ quality: 85 }) or .webp({ quality: 85 })
Write to output path

Output: final image file on disk

STAGE 6: REVIEW (optional, --review flag)
Send the final image to Claude Sonnet with vision:

Prompt includes the original user prompt, the plan JSON, and
the textInScene array (text that FAL was asked to render).

Ask Claude to score 1-10 on: - Composition and visual balance - Text readability (both Satori overlays AND FAL-rendered text) - Asset placement accuracy - Color harmony - Overall quality and prompt match - FAL text accuracy: does textInScene match what's visible?
(check for misspellings, warping, missing text)

If score < 7:
Claude returns corrections: - correctedOverlays: fixed overlay layer (re-run stages 4+5) - retryFal: boolean — if FAL-rendered text is garbled/wrong,
suggest re-generating with upgraded model (e.g. seedream -> banana-pro)
or moving the text from FAL to Satori overlay instead - correctedFalPrompt: if retryFal, an improved prompt - modelUpgrade: suggest a better model if current one wasnt enough

Re-run the relevant stages with corrections.
Max 2 review iterations to avoid infinite loops and cost runaway.
Log each iteration's cost and score to stderr.

Cost guard: if total spend exceeds $0.50 across retries, stop and
output the best result so far with a warning.

COMPOSITION FRAMEWORK

The planner does not guess pixel coordinates. It uses named zones.

Canvas is divided into named anchor zones (x%, y% of canvas):
hero-center: (50%, 45%) — slightly above true center, primary focal
title-area: (50%, 75%) — lower third for titles
top-bar: (50%, 8%) — top strip for badges and small text
bottom-bar: (50%, 92%) — bottom strip for watermarks and URLs
left-third: (25%, 50%) — left region for side-by-side layouts
right-third: (75%, 50%) — right region for side-by-side layouts
top-left-safe: (15%, 12%) — safe corner for branding
top-right-safe: (85%, 12%) — safe corner
bottom-left-safe: (15%, 88%) — safe corner
bottom-right-safe: (85%, 88%) — safe corner for watermark
center-left: (30%, 50%) — offset center
center-right: (70%, 50%) — offset center

The composer translates zones to pixel coordinates based on canvas size.
The planner can use raw {x, y} for fine positioning but zones are the default.

Visual hierarchy rules baked into the planner system prompt:

- One clear focal point per image
- Max 3 levels of text hierarchy (heading, subheading, detail)
- Heading at least 2.5x the body text size
- No more than 2 competing focal elements
- Minimum 10% padding from canvas edges (safe zone)
- Text occupies no more than 40% of canvas area
- Elements dont touch unless intentionally layered
- Consistent shadow direction across all elements
- Max 2 font families per image

PLATFORM PRESETS

Named presets that set size, safe zones, and platform-specific rules:

blog-featured: 1200x630
Safe: 10% inset all sides
Min heading: 48px
Default grade: cinematic

blog-inline: 800x450
Safe: 5% inset
Can be more detailed

og-image: 1200x630
Safe: key content within center 1000x500
Platforms crop edges differently

twitter-header: 1500x500
Safe: center 60% only (sides crop on mobile)
Text large and centered

instagram-square: 1080x1080
Safe: 10% inset, avoid bottom 15%

instagram-story: 1080x1920
Safe: avoid top 15% and bottom 20%

linkedin-post: 1200x627
Safe: similar to OG

youtube-thumbnail: 1280x720
Safe: avoid bottom-right 20% (duration badge)
High contrast required, text readable at small size

shopify-app-listing: 1200x628
Safe: 10% inset

Usage: --preset blog-featured (sets size + passes safe zone to planner)
Can combine with --size to override dimensions while keeping safe zone rules.

STYLE PRESETS

Named presets that influence the planner aesthetic:

dark-tech:
FAL prompt style: deep purple/blue tones, neon accents, particle dust, tech atmosphere
Font: Space Grotesk
Default glow: derive from asset dominant color
Grade: cinematic

minimal-light:
FAL prompt style: clean white/soft gray, subtle shadows, airy, bright
Font: Inter
Grade: clean

gradient-mesh:
FAL prompt style: vibrant multi-color mesh gradients, bold saturated
Font: Space Grotesk bold
Grade: vibrant

editorial:
FAL prompt style: muted earth tones, textured paper, sophisticated
Font: DM Serif Display
Grade: warm-editorial

glassmorphism:
FAL prompt style: frosted layers, translucent surfaces, soft blur
Font: Inter
Grade: cool-tech

MASK AND CLIP SYSTEM

Applied to image overlays before compositing.
Implemented by creating an alpha mask with Sharp.

How masks work:

1. Create a blank image (all transparent) matching the asset dimensions
2. Use Satori to render an SVG of the mask shape in white on transparent
   (or build the SVG string directly for simple shapes)
3. Convert SVG to PNG via resvg-js
4. Use Sharp composite with blend "dest-in" to apply the mask to the asset
   Result: asset is cut to the shape

Built-in shape presets (all percentage-based, scale to any size):
circle: SVG circle, cx=50%, cy=50%, r=50%
rounded: SVG rect with rx/ry
hexagon: SVG polygon with 6 points
diamond: SVG polygon with 4 points
blob1-5: preset organic bezier path shapes
custom: planner provides SVG path data

Gradient fade masks (soft edges):
Create a gradient SVG (white to transparent) and use as alpha mask.
The planner specifies direction and fade start/end percentages.
Example: fade bottom edge so screenshot blends into background.

DEVICE FRAME SYSTEM

Pre-made device frame PNG assets bundled with picture-it.
Each device frame includes:

- frame.png: the device chrome with transparent screen area
- metadata: screen area coordinates (x, y, width, height within the frame)

Bundled devices:
iphone: modern rounded rectangle, dynamic island notch
macbook: screen with keyboard base, slight perspective
browser: chrome-style window with tab bar and URL bar
ipad: tablet with thin bezels

To apply:

1. Load the screenshot asset
2. Resize screenshot to fit the frame's screen area dimensions
3. Create a canvas at the frame's full dimensions
4. Composite screenshot at the screen area coordinates
5. Composite frame.png on top (frame is opaque bezel, transparent screen)
6. The result becomes the "image" overlay for further processing (shadow, glow, etc.)

The planner triggers device frames by setting deviceFrame on image overlays.
Heuristic: if an asset is detected as a screenshot (landscape, no transparency),
the planner should strongly consider wrapping it in a device frame.

FAL MODELS: SPECS, API, AND COST-BASED ROUTING

Three edit models available, ranked cheapest to most expensive:

MODEL 1: SeedDream v4.5 — $0.04/image (CHEAPEST, default)
Endpoint: fal-ai/bytedance/seedream/v4.5/edit
Speed: ~60s
Max input images: 10
Strengths: multi-source composition, product swaps, text overlay copying,
element positioning across multiple sources, great value
Size handling: custom width/height (1920-4096px per axis, 2560x1440 to 4096x4096 total)
API params:
prompt (required): string
image_urls (required): list of URLs (up to 10, last 10 used if more)
image_size: preset enum OR custom { width, height }
Presets: square_hd, square, portrait_4_3, portrait_16_9,
landscape_4_3, landscape_16_9, auto_2K, auto_4K
num_images: 1-6 (number of separate generations)
max_images: 1-6 (images per generation, total outputs = num_images \* max_images)
seed: integer (optional)
sync_mode: boolean
enable_safety_checker: boolean (default true)

MODEL 2: Nano Banana 2 — $0.08/image (MID-TIER)
Endpoint: fal-ai/nano-banana-2/edit
Speed: fast (Flash architecture)
Max input images: 14
Strengths: vibrant output, fast iteration, thinking mode for complex reasoning,
web search grounding, extreme aspect ratios (4:1, 1:4, 8:1, 1:8)
Resolution: 0.5K, 1K, 2K (1.5x cost), 4K (2x cost)
API params:
prompt (required): string
image_urls (required): list of URLs (up to 14)
aspect_ratio: auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16,
4:1, 1:4, 8:1, 1:8
resolution: "0.5K" | "1K" | "2K" | "4K" (default 1K)
output_format: "jpeg" | "png" | "webp" (default png)
num_images: integer (default 1)
seed: integer (optional)
sync_mode: boolean
limit_generations: boolean (default true, limits to 1 output per round)
enable_web_search: boolean (ground edits in real-time web info)
thinking_level: "minimal" | "high" (enables model thinking for complex edits)

MODEL 3: Nano Banana Pro — $0.15/image (PREMIUM)
Endpoint: fal-ai/nano-banana-pro/edit
Speed: slower (quality-first Pro architecture)
Max input images: 14
Strengths: best text rendering, character consistency for up to 5 people,
deepest compositional reasoning, studio-quality output
Resolution: 1K, 2K, 4K (2x cost)
API params:
prompt (required): string
image_urls (required): list of URLs (up to 14)
aspect_ratio: auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16
resolution: "1K" | "2K" | "4K" (default 1K)
output_format: "jpeg" | "png" | "webp" (default png)
num_images: integer (default 1)
seed: integer (optional)
sync_mode: boolean
limit_generations: boolean
enable_web_search: boolean

BACKGROUND REMOVAL:
Endpoint: fal-ai/birefnet
Use to preprocess assets with busy backgrounds before compositing.

GENERATION (no input images, just text prompt):
fal-ai/flux/dev — quality generation for backgrounds
fal-ai/flux-schnell — fastest generation, lower quality

COST-BASED ROUTING

The planner selects the model based on task complexity, optimizing for cost.
Default to the cheapest model that can handle the job.

Tier 1 — Use SeedDream ($0.04) for:
Simple background generation with asset placement
Product swaps between reference images
Basic multi-image composition (up to 10 images)
Scenes where speed isnt critical (~60s is acceptable)
Most blog featured images, social cards, comparison graphics
This should be the DEFAULT for 80% of tasks

Tier 2 — Use Nano Banana 2 ($0.08) for:
Tasks requiring more than 10 input images (supports 14)
Extreme aspect ratios (4:1 banners, 1:4 tall images)
When vibrant/punchy colors are specifically needed
When speed matters (Flash architecture is faster)
When thinking mode would help (complex multi-step reasoning)
When web search grounding adds value (current events, real products)
When 0.5K resolution is enough (half cost at $0.06)

Tier 3 — Use Nano Banana Pro ($0.15) for:
Text that must look perfect INSIDE the generated scene
(stylized brand names, product labels, scene-integrated typography)
Character consistency across multiple people (up to 5)
Complex multi-step edits requiring deep compositional reasoning
Premium/hero images where maximum quality justifies the cost
When the planner detects the edit instructions are complex enough
to benefit from Pro-level reasoning

The planner can also be overridden with --model seedream|banana2|banana-pro

Cost estimation is logged to stderr:
"Model: seedream ($0.04) | Resolution: 1K | Estimated cost: $0.04"
This helps agents track spend per image.

FILE UPLOAD FOR FAL

All models require image_urls (not file uploads directly).
picture-it must upload local assets to FAL storage first:

import { fal } from "@fal-ai/client";
const file = new File([assetBuffer], filename);
const url = await fal.storage.upload(file);
// Use url in image_urls array

Upload all assets in parallel before calling the edit model.

COMMON API CALL PATTERN

import { fal } from "@fal-ai/client";

const result = await fal.subscribe(modelEndpoint, {
input: {
prompt: editPrompt,
image_urls: uploadedAssetUrls,
// ... model-specific params
},
logs: true,
onQueueUpdate: (update) => {
if (update.status === "IN_PROGRESS") {
update.logs.map((log) => log.message).forEach(console.log);
}
},
});

const outputImageUrl = result.data.images[0].url;
// Download and process with Sharp

SHADOW AND GLOW RENDERING (without CSS)

Shadow on an image:

1. Clone the asset image
2. Tint to shadow color with Sharp: sharp.tint(shadowColor)
3. Apply gaussian blur: sharp.blur(shadowBlur)
4. Composite this blurred shadow onto the base at (x + offsetX, y + offsetY)
5. Then composite the actual image on top at (x, y)

Glow on an image or text:

1. Clone the image/text PNG
2. Tint to glow color with Sharp
3. Extend canvas with sharp.extend() to give room for the glow bleed
4. Apply gaussian blur: sharp.blur(glowBlur)
5. Composite this blurred glow centered at the element position
6. Composite the actual element on top

Reflection under an image:

1. Clone the image
2. Flip vertically: sharp.flip()
3. Create a gradient alpha mask (opaque at top, transparent at bottom)
4. Apply mask to the flipped image
5. Reduce opacity to ~25-30%
6. Composite below the original image position

Auto shadows based on depth layer:
midground: blur 10, offset 4, opacity 0.2, color rgba(0,0,0,0.5)
foreground: blur 20, offset 8, opacity 0.3, color rgba(0,0,0,0.5)
overlay: blur 4, offset 2, opacity 0.15 (subtle text shadow backup)
When overlay specifies shadow: "auto", use these depth defaults.

TEXT RENDERING WITH SATORI

Satori takes a JSX tree and outputs SVG with correct layout.
resvg-js converts SVG to crisp PNG.

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const svg = await satori(jsxTree, {
width: textAreaWidth,
height: textAreaHeight,
fonts: [
{ name: "Inter", data: interRegularBuffer, weight: 400, style: "normal" },
{ name: "Inter", data: interBoldBuffer, weight: 700, style: "normal" },
{ name: "Space Grotesk", data: spaceGroteskBuffer, weight: 700, style: "normal" },
{ name: "DM Serif Display", data: dmSerifBuffer, weight: 400, style: "normal" },
],
});

const resvg = new Resvg(svg);
const pngBuffer = resvg.render().asPng();
// Composite pngBuffer onto base image with Sharp

Satori supported CSS subset (tell the planner):
display: flex, flexDirection, alignItems, justifyContent, flexWrap, gap
width, height, maxWidth, maxHeight, minWidth, minHeight
margin, padding (all sides)
position: absolute | relative, top, left, right, bottom
border, borderRadius, borderColor, borderWidth
fontSize, fontFamily, fontWeight, fontStyle
color, backgroundColor, backgroundImage (linear-gradient only)
textAlign, letterSpacing, lineHeight, textDecoration
textShadow (critical for readability)
opacity, overflow: hidden
backgroundClip: text (for gradient text effects)

Satori does NOT support:
display: grid, transforms, animations, pseudo-elements,
box-shadow (use wrapper div workarounds), filters

The planner groups related text into single satori-text overlays.
A title + subtitle + badge = one satori-text with flexbox layout,
not three separate overlays positioned independently.
This keeps text relationships intact and layout consistent.

PLANNER SYSTEM PROMPT

You are an expert graphic designer and image compositor powering a CLI tool
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

renderer: "satori-to-fal" ★ BEST for hero/prominent text
Pre-render text with Satori as transparent PNG.
Pass PNG as input image to FAL, reference as "Figure N" in prompt.
FAL integrates it into the scene with natural lighting and perspective.
Accurate letterforms + scene integration. Worth the extra step.
Use for: hero titles, brand names, stylized headings.

renderer: "fal-direct"
Text only in FAL prompt, model renders from scratch.
Track in textInScene for reviewer to verify.
Use for: short simple words, product labels, text on signs.

renderer: "satori-overlay"
Satori renders, Sharp composites flat on top after FAL.
Use for: UI text, subtitles, watermarks, badges, captions.

One image can use all three. Coordinate figure numbering when using
satori-to-fal: user assets are Figures 1-N, pre-rendered text PNGs
are Figures N+1 onwards.

What goes to FAL (Tier 1):
Atmospheric backgrounds, scene composition with natural lighting,
product photography, creative blending of reference images.
Can include text when it needs to look natural in the scene.
Can include logos when they should be integrated into the scene
(e.g. logo on a building, on a product, on clothing).

What goes to overlays (Tier 2):
Text that must be crisp (UI labels, titles, watermarks).
Brand logos that must be pixel-perfect at exact positions.
Badges, geometric shapes, arrows, device frames.

For FAL prompts:
Reference the dominant colors from the asset analysis for harmony.
When including text in the prompt, be explicit about placement and style.
Example with text: "Premium product photography of a green BB cream tube
with 'GreenGlow' branding visible on the tube, soft natural lighting,
botanical background with white flowers"
Example without text: "moody dark environment with soft purple (#7c3aed)
neon glow effects and subtle particle dust, premium tech atmosphere"

For satori-text JSX:
Use the Satori CSS subset only.
Always include textShadow for readability.
Group related text (title + subtitle) into one satori-text overlay.
Use flexbox for internal layout of text groups.

Common mistakes to avoid:

- Centering everything (use offset compositions for visual interest)
- Too many elements competing for attention
- Text too small for thumbnail readability
- Inconsistent shadow directions
- Clashing colors between assets and background
- Forgetting platform safe zones
- Placing text where the background might be bright without a contrast overlay
- Using Nano Banana Pro ($0.15) when SeedDream ($0.04) would suffice
- Using fal-direct for important text (use satori-to-fal for accuracy)
- Using satori-overlay when the text should feel part of the scene
  (use satori-to-fal instead for scene integration)
- Not tracking textInScene when using fal-direct
- Wrong figure numbering when mixing assets and pre-rendered text PNGs

AUTH AND CONFIG

Credentials persist in ~/.picture-it/config.json
This file stores API keys so they survive across sessions and terminals.
The CLI checks for keys in this order: 1. Environment variables (FAL_KEY, ANTHROPIC_API_KEY) — highest priority 2. ~/.picture-it/config.json — persistent storage 3. .env file in current directory — project-level override

Commands:

picture-it auth
Interactive setup. Prompts for each key, validates by making a
lightweight test call, then saves to ~/.picture-it/config.json.
Masks the key in terminal output (shows first 4 + last 4 chars only).

picture-it auth --fal <key>
Set FAL API key directly. Validates and saves.

picture-it auth --anthropic <key>
Set Anthropic API key directly. Validates and saves.

picture-it auth --status
Shows which keys are configured and from which source (env, config, .env).
Shows masked key values and validation status (valid/invalid/expired).
Example output:
FAL_KEY: sk-fa...3x9f (config.json) ✓
ANTHROPIC_API_KEY: sk-an...7k2m (env variable) ✓

picture-it auth --clear
Removes all keys from ~/.picture-it/config.json.
Asks for confirmation before clearing.

Config file format (~/.picture-it/config.json):
{
"fal_key": "...",
"anthropic_api_key": "...",
"default_model": "seedream",
"default_platform": "blog-featured",
"default_grade": "cinematic"
}

The config file also stores user defaults for model, platform, and grade.
These can be set with:
picture-it config set default_model banana2
picture-it config set default_platform og-image
picture-it config get default_model
picture-it config list

On first run of any command that needs API keys, if no keys are found,
the CLI prints a helpful message:
"No API keys configured. Run 'picture-it auth' to set up."
Exit 1.

File permissions: config.json is created with 0600 (owner read/write only)
to protect API keys.

CLI INTERFACE

picture-it create \
 --prompt "Dark tech blog header showing Hype vs competitor" \
 --assets hype-logo.png competitor-logo.png \
 --style "neon purple, dark, premium" \
 --preset dark-tech \
 --platform blog-featured \
 --size 1200x630 \
 --output header.png \
 --model seedream \
 --remove-bg \
 --review \
 --grain \
 --vignette

picture-it template vs-comparison \
 --left-logo hype.png \
 --right-logo alt.png \
 --glow-color "#a764ff" \
 --platform blog-featured \
 --output header.png

picture-it compose \
 --bg background.png \
 --overlays overlays.json \
 --size 1200x630 \
 --output final.png

picture-it batch \
 --spec images.json \
 --output-dir ./blog-images/

Flags:
--prompt: natural language description (required for create)
--assets: paths to images to include (logos, screenshots, icons)
--style: comma-separated style keywords
--preset: style preset name (dark-tech, minimal-light, etc.)
--platform: platform preset (blog-featured, og-image, youtube-thumbnail, etc.)
--size: WxH dimensions (overrides platform preset size if both given)
--output: output file path, extension sets format
--model: override FAL model selection (seedream, banana2, banana-pro, flux-dev, flux-schnell)
seedream = $0.04/img, banana2 = $0.08/img, banana-pro = $0.15/img
--remove-bg: force background removal on all assets via birefnet
--review: enable Claude Vision self-review loop (max 2 retries)
--grain: add subtle film grain
--vignette: add edge darkening
--grade: override color grade (cinematic, moody, vibrant, clean, warm, cool)
--no-fal: skip FAL generation, use CSS gradient background only
--bg: path to pre-made background image (skips FAL)
--batch: path to JSON spec for multi-image generation
--verbose: print detailed progress to stderr

TEMPLATE MODE

Deterministic mode with no AI calls. Fast. Predictable.
Uses Satori for rendering instead of Claude planning.

Each template is a function that takes typed parameters and returns
a list of overlays (same format as the planner output).

Templates to build:
vs-comparison:
leftLogo, rightLogo, vsText, glowColorLeft, glowColorRight,
leftLabel, rightLabel, showArrows, background (gradient CSS)
feature-hero:
logo, title, subtitle, glowColor, position (left|center|right)
text-hero:
title, subtitle, badge, textAlign, textColor, background
social-card:
title, description, logo, siteName, authorName

Template mode still uses the full pipeline (Sharp compositing, Satori text)
but skips FAL and Claude entirely. The template function generates the plan.

BATCH MODE

For blog automation generating multiple images per post:

picture-it batch --spec images.json --output-dir ./blog-images/

images.json:
[
{
"id": "featured",
"mode": "create",
"prompt": "...",
"assets": ["logo.png"],
"platform": "blog-featured",
"style": "dark-tech"
},
{
"id": "comparison",
"mode": "template",
"template": "vs-comparison",
"templateData": { "leftLogo": "hype.png", "rightLogo": "alt.png" },
"platform": "blog-featured"
},
{
"id": "social",
"mode": "create",
"prompt": "...",
"platform": "og-image"
}
]

All FAL generation requests fire in parallel.
All rendering shares resources.
Output: one image per entry in output-dir, named by id.
stdout: JSON array of output paths.

FONTS TO BUNDLE

Download TTF files and include in the project:
Inter: 400, 600, 700 (clean sans-serif, default body)
Space Grotesk: 500, 700 (techy headings)
DM Serif Display: 400 (editorial/classy headings)

Load all with fs.readFile at CLI startup.
Pass as ArrayBuffers to every Satori render call.
Zero network dependency during rendering.

OUTPUT BEHAVIOR

stdout: only the output file path (or JSON array for batch)
stderr: all progress logs, warnings, review scores, contrast warnings
Exit 0 on success
Exit 1 on failure with error message to stderr

This separation is critical for agent consumption.
The calling agent reads stdout to get the file path, ignores stderr.

ERROR HANDLING

FAL API fails: fall back to gradient canvas from plan.fallbackBg, warn on stderr
Claude planner fails: fall back to default template with sensible defaults
Claude reviewer fails: skip review, output the unreviewed image
Asset file not found: exit 1 with clear error listing missing files
Satori render fails: exit 1 with error (likely bad JSX from planner)
Sharp operation fails: exit 1 with error
Font file missing: fall back to available fonts, warn on stderr

BUILD PHASES

Phase 1: CLI setup, Sharp compositing, compose mode
Get basic image-on-image compositing working end to end.
picture-it compose --bg bg.png --overlays overlays.json --output result.png

Phase 2: Satori text rendering
Render JSX text layouts to PNG, composite onto images.
Test with hardcoded JSX first.

Phase 3: Shadow, glow, reflection effects
Implement the Sharp-based effect pipeline.

Phase 4: Claude planner integration
Create mode works with Claude generating plans.
No FAL yet, use gradient backgrounds.

Phase 5: FAL integration - generation
flux-dev and flux-schnell for backgrounds.
Exact size handling with smart crop.

Phase 6: FAL integration - editing
seedream and nano-banana edit models.
birefnet background removal.

Phase 7: Asset analysis and color intelligence
Auto-extract palettes, detect content types.
Feed to planner for harmony.

Phase 8: Contrast safety check
Auto-detect low contrast text areas.
Auto-inject gradient overlays.

Phase 9: Masks, clips, device frames
Shape masks with SVG alpha.
Bundled device frame PNGs.

Phase 10: Blend layers and depth system
Multi-layer FAL generation with blend modes.
Depth-based auto shadows.

Phase 11: Color grading and post-processing
Sharp recomb/modulate for color grades.
Grain and vignette.

Phase 12: Claude Vision reviewer
Self-improvement loop with max 2 retries.

Phase 13: Templates, presets, batch mode, polish
All built-in templates.
Style and platform presets.
Batch JSON spec processing.

Start Phase 1. Get compose mode working first.
CLI parses args -> loads background image -> loads overlays JSON ->
composites images at specified coordinates -> writes output.
Once that round-trips, everything else layers on top.
