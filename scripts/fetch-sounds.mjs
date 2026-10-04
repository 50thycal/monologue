// Build-time sound pipeline.
//
// For every entry in sounds.config.json: download the original clip, trim
// leading silence, cap its length, and loudness-normalize it (two-pass EBU
// R128 loudnorm) so every pad hits at the same perceived volume. Output goes
// to public/sfx/<id>-<hash>.mp3 plus public/sfx/manifest.json, which the app
// loads at startup.
//
// Failures never break the build: a clip that can't be downloaded falls back
// to its original URL at runtime when that host allows CORS, and is otherwise
// left out of the manifest.
//
// SFX_PLACEHOLDER=1 swaps every download for a generated tone so the app can
// be exercised offline.

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "sfx");
const config = JSON.parse(await readFile(join(root, "sounds.config.json"), "utf8"));

// Hosts that send Access-Control-Allow-Origin: *, so the browser can fetch the
// original directly if the build couldn't.
const CORS_OK = new Set(["rm", "gg", "rs"]);
const TARGET_LUFS = -16;
const LIMIT = 0.84; // ≈ -1.5 dBFS ceiling
const MAX_BOOST_DB = 18;
const PLACEHOLDER = process.env.SFX_PLACEHOLDER === "1";

function findFfmpeg() {
  try {
    const p = createRequire(import.meta.url)("@ffmpeg-installer/ffmpeg").path;
    if (existsSync(p)) return p;
  } catch {}
  return "ffmpeg";
}
const ffmpeg = findFfmpeg();

async function hasFfmpeg() {
  try {
    await run(ffmpeg, ["-hide_banner", "-version"]);
    return true;
  } catch {
    return false;
  }
}

function resolveSrc(src) {
  const i = src.indexOf(":");
  const prefix = src.slice(0, i);
  const base = config.sources[prefix];
  if (!base) throw new Error(`unknown source prefix in ${src}`);
  return { prefix, url: base + src.slice(i + 1) };
}

async function download(url, dest) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) throw new Error(`suspiciously small (${buf.length} bytes)`);
      await writeFile(dest, buf);
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function ff(args) {
  // ffmpeg logs (including loudnorm's JSON) go to stderr.
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-nostdin", "-y", ...args], { maxBuffer: 16 << 20 });
  return stderr;
}

async function normalize(input, output, s) {
  const max = s.max ?? 8;
  const stereo = s.mode === "toggle";
  const pre = [
    "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02",
    `atrim=0:${max}`,
    "asetpts=N/SR/TB",
  ];

  // Pass 1: measure integrated loudness (EBU R128) of exactly what we'll keep.
  const probe = await ff(["-i", input, "-af", [...pre, "loudnorm=print_format=json"].join(","), "-f", "null", "-"]);
  const m = JSON.parse(probe.slice(probe.lastIndexOf("{"), probe.lastIndexOf("}") + 1));
  const dur = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe);
  const srcSeconds = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : max;

  // Pass 2: static gain to the target + a brickwall limiter for the peaks.
  // (loudnorm's own gain stage is unreliable on clips shorter than ~3 s,
  // which is most meme sounds.) Boost is capped so near-silent clips don't
  // turn into hiss.
  const inputI = Number(m.input_i);
  const gain = Number.isFinite(inputI) && inputI > -70 ? Math.min(MAX_BOOST_DB, TARGET_LUFS - inputI) : 0;
  const chain = [...pre, `volume=${gain.toFixed(2)}dB`, `alimiter=limit=${LIMIT}:attack=2:release=60:level=0`];
  // Clips cut short by `max` get a fade so they don't end on a click.
  if (srcSeconds > max + 0.25) chain.push(`afade=t=out:st=${Math.max(0, max - 0.6)}:d=0.6`);
  // Tiny fade-in kills clicks from trimming mid-waveform.
  chain.push("afade=t=in:d=0.005");

  await ff(["-i", input, "-af", chain.join(","), "-ar", "44100", "-ac", stereo ? "2" : "1", "-c:a", "libmp3lame", "-b:a", stereo ? "160k" : "128k", output]);
}

async function placeholder(output, s, i) {
  const freq = 220 + (i % 24) * 40;
  await ff(["-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${s.mode === "toggle" ? 6 : 0.6}`, "-af", "afade=t=out:st=0.3:d=0.3", "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", output]);
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

const canProcess = await hasFfmpeg();
if (!canProcess) console.warn("[sfx] ffmpeg unavailable: clips will be used as-is (no normalization)");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const work = join(tmpdir(), `monologue-sfx-${process.pid}`);
await mkdir(work, { recursive: true });

const started = Date.now();
const entries = await pool(config.sounds, 8, async (s, i) => {
  const { prefix, url } = resolveSrc(s.src);
  const hash = createHash("sha1").update(JSON.stringify([s.src, s.max, s.mode, TARGET_LUFS, PLACEHOLDER])).digest("hex").slice(0, 8);
  const file = `${s.id}-${hash}.mp3`;
  const meta = { id: s.id, label: s.label, emoji: s.emoji, cat: s.cat, mode: s.mode ?? "shot" };
  try {
    if (PLACEHOLDER) {
      await placeholder(join(outDir, file), s, i);
      return { ...meta, url: `/sfx/${file}` };
    }
    const ext = url.split(".").pop().split("?")[0];
    const raw = join(work, `${s.id}.${ext}`);
    await download(url, raw);
    if (canProcess) {
      try {
        await normalize(raw, join(outDir, file), s);
        return { ...meta, url: `/sfx/${file}` };
      } catch (e) {
        console.warn(`[sfx] ${s.id}: normalize failed (${e.message.split("\n")[0]}), using original`);
      }
    }
    const rawName = `${s.id}-${hash}.${ext}`;
    await writeFile(join(outDir, rawName), await readFile(raw));
    return { ...meta, url: `/sfx/${rawName}` };
  } catch (e) {
    if (CORS_OK.has(prefix)) {
      console.warn(`[sfx] ${s.id}: download failed (${e.message}); runtime fallback to ${url}`);
      return { ...meta, url };
    }
    console.warn(`[sfx] ${s.id}: download failed (${e.message}); skipped`);
    return null;
  }
});

await rm(work, { recursive: true, force: true });
const sounds = entries.filter(Boolean);
await writeFile(join(outDir, "manifest.json"), JSON.stringify({ categories: config.categories, sounds }, null, 1));
const local = sounds.filter((s) => s.url.startsWith("/sfx/")).length;
const files = await readdir(outDir);
console.log(`[sfx] ${local} local, ${sounds.length - local} remote, ${config.sounds.length - sounds.length} skipped (${files.length - 1} files) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
