/**
 * Env loader side-effect module. Import this FIRST from `server/index.ts`
 * (and any other entry point) so that `.env.local` / `.env` are populated
 * into `process.env` before any other module runs.
 *
 * Precedence (highest → lowest):
 *   1. Variables already set in `process.env` (OS, Railway, CI).
 *   2. `.env.local` — developer-local overrides, git-ignored.
 *   3. `.env`       — committed shared defaults.
 *
 * `dotenv.config()` never overwrites an existing value, so loading
 * `.env.local` first gives it precedence over `.env`. Missing files are
 * silently ignored, which is expected on Railway (no files deployed).
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
