# VetTrack Hero Video Automation

This guide runs an automated, narrated hero walkthrough using Playwright + TTS and exports a single MP4.

## What it does

- Generates TTS audio per scene segment from the approved narration script.
- Measures actual audio durations (`ffprobe`).
- Runs Playwright UI actions mapped to each segment.
- Enforces sentence-level timing gates so scene transitions wait for narration.
- Muxes captured screen video + narration audio into one output MP4 (`ffmpeg`).

Script file:

- `scripts/generate-hero-video.ts`

## Prerequisites

- VetTrack app running (`http://localhost:5000` by default)
- `ffmpeg` and `ffprobe` installed
- Playwright browser dependencies installed (already in this repo)
- A demo PDF for Pharmacy scene upload (default: `/tmp/hero_medications.pdf`)

## TTS provider options

### Option A: OpenAI TTS (default)

Required env:

- `OPENAI_API_KEY`

Optional env:

- `HERO_OPENAI_MODEL` (default: `gpt-4o-mini-tts`)
- `HERO_TTS_VOICE` (default: `alloy`)
- `HERO_TTS_SPEED` (default: `1.08`)

### Option B: ElevenLabs

Required env:

- `ELEVENLABS_API_KEY`

Optional env:

- `ELEVENLABS_VOICE_ID` (default fallback is used if omitted)
- `HERO_ELEVENLABS_MODEL` (default: `eleven_multilingual_v2`)
- `HERO_TTS_SPEED` (timing still uses measured audio duration)

## Commands

### 1) Dry-run timing only (no external TTS calls)

This creates silent scene audio with estimated durations and validates the timeline pipeline:

`pnpm video:hero --dry-run --skip-browser`

### 2) Full render with OpenAI TTS

`OPENAI_API_KEY=... pnpm video:hero --provider openai --voice alloy`

### 3) Full render with ElevenLabs TTS

`ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=... pnpm video:hero --provider elevenlabs`

## Useful flags

- `--base-url http://localhost:5000`
- `--output /opt/cursor/artifacts/vettrack_hero_video.mp4`
- `--demo-pdf /tmp/hero_medications.pdf`
- `--headed` (shows browser while recording)
- `--max-segments 2` (quick smoke test)
- `--skip-browser` (audio/timeline only)
- `--dry-run` (silent audio generation; no TTS API calls)

## Outputs

- Final video: path from `--output` (default `/opt/cursor/artifacts/vettrack_hero_video.mp4`)
- Timeline manifest (temp dir): includes scene/action/duration metadata for QA

