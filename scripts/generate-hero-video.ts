import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright";

type TtsProvider = "openai" | "elevenlabs";

interface SegmentPlan {
  id: string;
  narration: string;
  action: SceneActionName;
}

type SceneActionName =
  | "scene1DashboardSweep"
  | "scene2RoomRadar"
  | "scene2InventoryAndTasks"
  | "scene3PharmacyIntegration"
  | "scene3MedicationHub"
  | "scene4EnterCodeBlue"
  | "scene4FocusCriticalEquipment"
  | "scene5ShiftHandover"
  | "scene5AnalyticsOutro";

interface SegmentAsset {
  plan: SegmentPlan;
  audioSourcePath: string;
  audioWavPath: string;
  durationSec: number;
}

interface CliOptions {
  baseUrl: string;
  outputFile: string;
  demoPdfPath: string;
  provider: TtsProvider;
  voice: string;
  speed: number;
  dryRun: boolean;
  headless: boolean;
  skipBrowser: boolean;
  maxSegments: number | null;
  openAiModel: string;
  elevenLabsModel: string;
}

interface RuntimeContext {
  options: CliOptions;
  page: Page;
  workDir: string;
}

const HERO_SEGMENTS: SegmentPlan[] = [
  {
    id: "scene-1-intro",
    narration:
      "A 24/7 veterinary hospital is an environment of controlled chaos. Every second counts. Meet VetTrack. The operating system that takes the chaos, and turns it into absolute control.",
    action: "scene1DashboardSweep",
  },
  {
    id: "scene-2-room-radar",
    narration:
      "Forget searching for equipment. One scan with Room Radar shows you everything: what's there, what's missing, and who has it right now.",
    action: "scene2RoomRadar",
  },
  {
    id: "scene-2-inventory-tasks",
    narration:
      "Inventory running low? One-touch restock, and automatic patient billing. Zero waste. Zero paperwork. Need something now? The system dispatches rapid tasks directly to the team's WhatsApp.",
    action: "scene2InventoryAndTasks",
  },
  {
    id: "scene-3-pharmacy",
    narration:
      "Doctors need to heal, not do admin. Drop a PDF into the system, and get a full medication plan for the next 72 hours.",
    action: "scene3PharmacyIntegration",
  },
  {
    id: "scene-3-med-hub",
    narration:
      "Need immediate sedation? Send an order to the technicians through the Medication Hub. Everything is documented, everything is transparent.",
    action: "scene3MedicationHub",
  },
  {
    id: "scene-4-climax-open",
    narration: "And when an emergency strikes... Code Blue.",
    action: "scene4EnterCodeBlue",
  },
  {
    id: "scene-4-climax-focus",
    narration:
      "One click, and VetTrack cuts through the noise. It points you exactly to the nearest critical equipment, 100% ready for action. No guessing.",
    action: "scene4FocusCriticalEquipment",
  },
  {
    id: "scene-5-handover",
    narration:
      "Shift over? The shift handover screen shows you not just what was done, but the exact bottom line.",
    action: "scene5ShiftHandover",
  },
  {
    id: "scene-5-outro",
    narration: "VetTrack. Less distractions, more medicine. It's time to work smarter.",
    action: "scene5AnalyticsOutro",
  },
];

const DEFAULT_OUTPUT_FILE = path.resolve(process.cwd(), "/opt/cursor/artifacts/vettrack_hero_video.mp4");
const DEFAULT_DEMO_PDF = "/tmp/hero_medications.pdf";

function parseCliArgs(argv: string[]): CliOptions {
  const out: CliOptions = {
    baseUrl: process.env.HERO_BASE_URL ?? "http://localhost:5000",
    outputFile: process.env.HERO_OUTPUT_FILE ?? DEFAULT_OUTPUT_FILE,
    demoPdfPath: process.env.HERO_DEMO_PDF ?? DEFAULT_DEMO_PDF,
    provider: (process.env.HERO_TTS_PROVIDER as TtsProvider) || "openai",
    voice: process.env.HERO_TTS_VOICE ?? "alloy",
    speed: Number.parseFloat(process.env.HERO_TTS_SPEED ?? "1.08"),
    dryRun: false,
    headless: true,
    skipBrowser: false,
    maxSegments: null,
    openAiModel: process.env.HERO_OPENAI_MODEL ?? "gpt-4o-mini-tts",
    elevenLabsModel: process.env.HERO_ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--base-url":
        if (!next) throw new Error("--base-url requires a value");
        out.baseUrl = next;
        i += 1;
        break;
      case "--output":
        if (!next) throw new Error("--output requires a value");
        out.outputFile = path.resolve(next);
        i += 1;
        break;
      case "--demo-pdf":
        if (!next) throw new Error("--demo-pdf requires a value");
        out.demoPdfPath = path.resolve(next);
        i += 1;
        break;
      case "--provider":
        if (!next) throw new Error("--provider requires a value");
        if (next !== "openai" && next !== "elevenlabs") {
          throw new Error(`Unsupported --provider "${next}"`);
        }
        out.provider = next;
        i += 1;
        break;
      case "--voice":
        if (!next) throw new Error("--voice requires a value");
        out.voice = next;
        i += 1;
        break;
      case "--speed":
        if (!next) throw new Error("--speed requires a value");
        out.speed = Number.parseFloat(next);
        i += 1;
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--headed":
        out.headless = false;
        break;
      case "--skip-browser":
        out.skipBrowser = true;
        break;
      case "--max-segments":
        if (!next) throw new Error("--max-segments requires a value");
        out.maxSegments = Number.parseInt(next, 10);
        i += 1;
        break;
      default:
        break;
    }
  }

  if (!Number.isFinite(out.speed) || out.speed <= 0) {
    throw new Error(`Invalid --speed value "${out.speed}"`);
  }

  return out;
}

function logInfo(message: string): void {
  const stamp = new Date().toISOString();
  console.log(`[hero-video ${stamp}] ${message}`);
}

function estimateDurationSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // ~170 wpm + slight pause allowance for sentence ends.
  return Math.max(2.2, words / 2.85 + 0.45);
}

async function runCommand(command: string, args: string[], label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text.length > 0) logInfo(`${label}: ${text}`);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with code ${code}: ${stderr}`));
    });
  });
}

async function getMediaDurationSec(filePath: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed for ${filePath}: ${err}`));
        return;
      }
      const value = Number.parseFloat(out.trim());
      if (!Number.isFinite(value)) {
        reject(new Error(`Unable to parse duration for ${filePath}: "${out.trim()}"`));
        return;
      }
      resolve(value);
    });
  });
}

async function createSilentAudio(filePath: string, durationSec: number): Promise<void> {
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=mono",
      "-t",
      durationSec.toFixed(3),
      "-acodec",
      "pcm_s16le",
      filePath,
    ],
    "ffmpeg-silence",
  );
}

async function synthesizeOpenAiSegment(
  segment: SegmentPlan,
  targetPath: string,
  options: CliOptions,
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when --provider openai is used.");
  }
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.openAiModel,
      voice: options.voice,
      input: segment.narration,
      format: "mp3",
      speed: options.speed,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI TTS failed (${response.status}): ${body}`);
  }
  const payload = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, payload);
}

async function synthesizeElevenLabsSegment(
  segment: SegmentPlan,
  targetPath: string,
  options: CliOptions,
): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is required when --provider elevenlabs is used.");
  }
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: segment.narration,
      model_id: options.elevenLabsModel,
      voice_settings: {
        stability: 0.38,
        similarity_boost: 0.84,
        style: 0.05,
        use_speaker_boost: true,
      },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${body}`);
  }
  const payload = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, payload);
}

async function synthesizeSegmentAudio(
  segment: SegmentPlan,
  sourcePath: string,
  wavPath: string,
  options: CliOptions,
): Promise<number> {
  if (options.dryRun) {
    const estimated = estimateDurationSec(segment.narration);
    await createSilentAudio(wavPath, estimated);
    return estimated;
  }

  if (options.provider === "openai") {
    await synthesizeOpenAiSegment(segment, sourcePath, options);
  } else {
    await synthesizeElevenLabsSegment(segment, sourcePath, options);
  }

  await runCommand(
    "ffmpeg",
    ["-y", "-i", sourcePath, "-ac", "1", "-ar", "44100", "-acodec", "pcm_s16le", wavPath],
    `ffmpeg-to-wav:${segment.id}`,
  );
  return getMediaDurationSec(wavPath);
}

async function makeSegmentAssets(options: CliOptions, workDir: string): Promise<SegmentAsset[]> {
  const segmentsDir = path.join(workDir, "segments");
  await fs.mkdir(segmentsDir, { recursive: true });
  const limitedPlans =
    options.maxSegments && options.maxSegments > 0
      ? HERO_SEGMENTS.slice(0, options.maxSegments)
      : HERO_SEGMENTS;
  const assets: SegmentAsset[] = [];

  for (const [index, plan] of limitedPlans.entries()) {
    const ordinal = String(index + 1).padStart(2, "0");
    const sourceExt = options.dryRun ? "txt" : "mp3";
    const sourcePath = path.join(segmentsDir, `${ordinal}-${plan.id}.${sourceExt}`);
    const wavPath = path.join(segmentsDir, `${ordinal}-${plan.id}.wav`);

    if (options.dryRun) {
      await fs.writeFile(sourcePath, plan.narration, "utf8");
    }

    const durationSec = await synthesizeSegmentAudio(plan, sourcePath, wavPath, options);
    assets.push({
      plan,
      audioSourcePath: sourcePath,
      audioWavPath: wavPath,
      durationSec,
    });
    logInfo(`Prepared segment ${plan.id} (${durationSec.toFixed(2)}s)`);
  }

  return assets;
}

async function concatNarrationAudio(assets: SegmentAsset[], outputPath: string, workDir: string): Promise<void> {
  const concatFile = path.join(workDir, "audio-concat.txt");
  const body = assets.map((asset) => `file '${asset.audioWavPath.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.writeFile(concatFile, `${body}\n`, "utf8");
  await runCommand(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", outputPath],
    "ffmpeg-concat-audio",
  );
}

async function smoothScroll(page: Page, pixels: number, durationMs: number): Promise<void> {
  const steps = 30;
  const perStep = Math.round(pixels / steps);
  const wait = Math.round(durationMs / steps);
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, perStep);
    await page.waitForTimeout(wait);
  }
}

async function safeClick(locator: Locator, page: Page): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: "visible", timeout: 5_000 });
    const box = await locator.first().boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
      await page.waitForTimeout(100);
    }
    await locator.first().click();
    return true;
  } catch {
    return false;
  }
}

async function gotoPath(page: Page, baseUrl: string, pathname: string): Promise<void> {
  await page.goto(new URL(pathname, baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
}

async function dismissOnboardingIfPresent(page: Page): Promise<void> {
  const skipBtn = page.getByRole("button", { name: /דלג|Skip/i });
  const closeBtn = page.getByRole("button", { name: /סגור|Close/i });
  if ((await skipBtn.count()) > 0) {
    await safeClick(skipBtn, page);
  }
  if ((await closeBtn.count()) > 0) {
    await safeClick(closeBtn, page);
  }
}

async function ensureAuthenticated(page: Page, baseUrl: string): Promise<void> {
  await gotoPath(page, baseUrl, "/");
  await dismissOnboardingIfPresent(page);

  const continueBtn = page.getByRole("button", { name: /Continue to Dashboard/i });
  if ((await continueBtn.count()) > 0) {
    await safeClick(continueBtn, page);
    await page.waitForTimeout(1200);
  }
}

async function scene1DashboardSweep(ctx: RuntimeContext): Promise<void> {
  await gotoPath(ctx.page, ctx.options.baseUrl, "/");
  await smoothScroll(ctx.page, 2_200, 4_500);
  await smoothScroll(ctx.page, -2_200, 3_200);
}

async function scene2RoomRadar(ctx: RuntimeContext): Promise<void> {
  await gotoPath(ctx.page, ctx.options.baseUrl, "/rooms");
  const firstRoomLink = ctx.page.locator('a[href^="/rooms/"]');
  const clickedRoom = await safeClick(firstRoomLink, ctx.page);
  if (!clickedRoom) {
    // fallback route with NFC verify overlay simulation
    const firstRoomCard = ctx.page.locator("button").filter({ hasText: /ICU|ER|Room|Ward|Radar/i });
    if (!(await safeClick(firstRoomCard, ctx.page))) {
      await ctx.page.waitForTimeout(1200);
    }
  }
  await ctx.page.waitForTimeout(900);
  await smoothScroll(ctx.page, 850, 1_800);
  const alertText = ctx.page.getByText(/missing|Issue|In Use|Another user/i);
  if ((await alertText.count()) > 0) {
    await alertText.first().hover();
    await ctx.page.waitForTimeout(500);
  }
}

async function scene2InventoryAndTasks(ctx: RuntimeContext): Promise<void> {
  await gotoPath(ctx.page, ctx.options.baseUrl, "/inventory");
  await ctx.page.waitForTimeout(900);

  const plusButton = ctx.page.locator('button[aria-label^="Increment"]').first();
  if ((await plusButton.count()) > 0) {
    await safeClick(plusButton, ctx.page);
    await ctx.page.waitForTimeout(350);
    await safeClick(plusButton, ctx.page);
  }

  const finishRestock = ctx.page.getByRole("button", { name: /Finish Restock/i });
  if ((await finishRestock.count()) > 0) {
    await safeClick(finishRestock, ctx.page);
    await ctx.page.waitForTimeout(700);
  }

  await gotoPath(ctx.page, ctx.options.baseUrl, "/appointments");
  const createTask = ctx.page.getByRole("button", { name: /Create task|Create Task/i });
  if ((await createTask.count()) > 0) {
    await safeClick(createTask, ctx.page);
    await ctx.page.waitForTimeout(400);

    const techSelect = ctx.page.getByLabel(/Technician/i);
    if ((await techSelect.count()) > 0) {
      await techSelect.selectOption({ index: 1 }).catch(() => undefined);
    }
    const assetField = ctx.page.getByLabel(/Device \/ Asset/i);
    if ((await assetField.count()) > 0) {
      await assetField.fill("Emergency fluid pack - ICU");
    }
    const notes = ctx.page.getByLabel(/Notes/i);
    if ((await notes.count()) > 0) {
      await notes.fill("Rapid logistics dispatch");
    }
    const submit = ctx.page.getByRole("button", { name: /Create Task/i });
    if ((await submit.count()) > 0) {
      await safeClick(submit, ctx.page);
      await ctx.page.waitForTimeout(600);
    }
  }
}

async function scene3PharmacyIntegration(ctx: RuntimeContext): Promise<void> {
  await gotoPath(ctx.page, ctx.options.baseUrl, "/pharmacy-forecast");
  const pdfMode = ctx.page.getByRole("button", { name: /PDF/i });
  if ((await pdfMode.count()) > 0) {
    await safeClick(pdfMode, ctx.page);
  }

  const fileInput = ctx.page.locator('input[type="file"][accept*="pdf"]');
  if ((await fileInput.count()) > 0) {
    await fileInput.setInputFiles(ctx.options.demoPdfPath);
  }

  const parseButton = ctx.page.getByRole("button", { name: /Parse and continue/i });
  if ((await parseButton.count()) > 0) {
    await safeClick(parseButton, ctx.page);
  }
  await ctx.page.waitForTimeout(1_600);
}

async function scene3MedicationHub(ctx: RuntimeContext): Promise<void> {
  await gotoPath(ctx.page, ctx.options.baseUrl, "/meds");
  await ctx.page.waitForTimeout(700);

  const techSelect = ctx.page.locator("#med-performing-technician");
  if ((await techSelect.count()) > 0) {
    await techSelect.selectOption({ index: 1 }).catch(() => undefined);
  }
  const drugSelect = ctx.page.locator("#drug-select");
  if ((await drugSelect.count()) > 0) {
    await drugSelect.selectOption({ index: 1 }).catch(() => undefined);
  }
  const weightInput = ctx.page.locator("#weight-input");
  if ((await weightInput.count()) > 0) {
    await weightInput.fill("12.5");
  }
  const desiredDose = ctx.page.locator("#desired-mg-input");
  if ((await desiredDose.count()) > 0) {
    await desiredDose.fill("25");
  }

  const assignButton = ctx.page.getByRole("button", { name: /Assign Medication/i });
  if ((await assignButton.count()) > 0) {
    await safeClick(assignButton, ctx.page);
  }
  await ctx.page.waitForTimeout(900);
}

async function scene4EnterCodeBlue(ctx: RuntimeContext): Promise<void> {
  const codeBlueNav = ctx.page.getByRole("link", { name: /Code Blue/i });
  if (!(await safeClick(codeBlueNav, ctx.page))) {
    await gotoPath(ctx.page, ctx.options.baseUrl, "/code-blue");
  }
  await ctx.page.waitForTimeout(700);
}

async function scene4FocusCriticalEquipment(ctx: RuntimeContext): Promise<void> {
  await gotoPath(ctx.page, ctx.options.baseUrl, "/code-blue");
  const firstCriticalCard = ctx.page.locator('[data-testid^="critical-equipment-card-"]').first();
  if ((await firstCriticalCard.count()) > 0) {
    await firstCriticalCard.scrollIntoViewIfNeeded();
    await ctx.page.waitForTimeout(300);
    await firstCriticalCard.hover();
  }
  await smoothScroll(ctx.page, 400, 1_200);
}

async function scene5ShiftHandover(ctx: RuntimeContext): Promise<void> {
  await gotoPath(ctx.page, ctx.options.baseUrl, "/shift-handover");
  await ctx.page.waitForTimeout(1_200);
  await smoothScroll(ctx.page, 1_300, 3_000);
  await smoothScroll(ctx.page, -700, 1_500);
}

async function scene5AnalyticsOutro(ctx: RuntimeContext): Promise<void> {
  await gotoPath(ctx.page, ctx.options.baseUrl, "/analytics");
  await ctx.page.waitForTimeout(1_600);
}

const actionHandlers: Record<SceneActionName, (ctx: RuntimeContext) => Promise<void>> = {
  scene1DashboardSweep,
  scene2RoomRadar,
  scene2InventoryAndTasks,
  scene3PharmacyIntegration,
  scene3MedicationHub,
  scene4EnterCodeBlue,
  scene4FocusCriticalEquipment,
  scene5ShiftHandover,
  scene5AnalyticsOutro,
};

async function runSceneTimeline(ctx: RuntimeContext, assets: SegmentAsset[]): Promise<void> {
  await ensureAuthenticated(ctx.page, ctx.options.baseUrl);
  for (const asset of assets) {
    const start = Date.now();
    logInfo(`Running ${asset.plan.id} (${asset.durationSec.toFixed(2)}s narration)`);
    await actionHandlers[asset.plan.action](ctx);
    const elapsedSec = (Date.now() - start) / 1000;
    const holdMs = Math.max(0, Math.round((asset.durationSec - elapsedSec) * 1000));
    if (holdMs > 0) {
      await ctx.page.waitForTimeout(holdMs);
    }
  }
}

async function renderVideoTimeline(
  options: CliOptions,
  assets: SegmentAsset[],
  narrationPath: string,
  workDir: string,
): Promise<string | null> {
  if (options.skipBrowser) {
    logInfo("Skipping browser capture (--skip-browser enabled).");
    return null;
  }

  const browser = await chromium.launch({ headless: options.headless });
  const contextOptions: Parameters<typeof browser.newContext>[0] = {
    viewport: { width: 1920, height: 1080 },
  };
  if (!options.skipBrowser) {
    contextOptions.recordVideo = {
      dir: path.join(workDir, "raw-video"),
      size: { width: 1920, height: 1080 },
    };
  }

  const context: BrowserContext = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const runtimeCtx: RuntimeContext = { options, page, workDir };
  await runSceneTimeline(runtimeCtx, assets);
  await page.waitForTimeout(1_000);

  const video = page.video();
  await context.close();
  await browser.close();

  if (!video) return null;
  const rawVideoPath = await video.path();
  const mergedPath = path.resolve(options.outputFile);
  await fs.mkdir(path.dirname(mergedPath), { recursive: true });
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-i",
      rawVideoPath,
      "-i",
      narrationPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "19",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      mergedPath,
    ],
    "ffmpeg-mux-final",
  );
  return mergedPath;
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  const runId = `hero-video-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const workDir = path.join(os.tmpdir(), runId);
  await fs.mkdir(workDir, { recursive: true });

  logInfo(`Working directory: ${workDir}`);
  logInfo(`Provider=${options.provider} dryRun=${String(options.dryRun)} baseUrl=${options.baseUrl}`);

  if (!options.skipBrowser) {
    const pdfStat = await fs.stat(options.demoPdfPath).catch(() => null);
    if (!pdfStat) {
      throw new Error(
        `Demo PDF not found at "${options.demoPdfPath}". Generate one first or pass --demo-pdf <path>.`,
      );
    }
  }

  const assets = await makeSegmentAssets(options, workDir);
  const narrationPath = path.join(workDir, "narration.wav");
  await concatNarrationAudio(assets, narrationPath, workDir);
  const narrationDuration = await getMediaDurationSec(narrationPath);
  logInfo(`Narration duration: ${narrationDuration.toFixed(2)}s`);

  const mergedVideo = await renderVideoTimeline(options, assets, narrationPath, workDir);
  const timelinePath = path.join(workDir, "timeline.json");
  await fs.writeFile(
    timelinePath,
    JSON.stringify(
      {
        options,
        narrationPath,
        narrationDurationSec: narrationDuration,
        segments: assets.map((asset) => ({
          id: asset.plan.id,
          narration: asset.plan.narration,
          action: asset.plan.action,
          durationSec: asset.durationSec,
          audioWavPath: asset.audioWavPath,
        })),
        mergedVideo,
      },
      null,
      2,
    ),
    "utf8",
  );

  if (mergedVideo) {
    logInfo(`Hero video complete: ${mergedVideo}`);
  } else {
    logInfo("Audio + timeline generated. Browser capture skipped.");
  }
  logInfo(`Timeline manifest: ${timelinePath}`);
}

main().catch((error) => {
  console.error("[hero-video] failed", error);
  process.exit(1);
});
