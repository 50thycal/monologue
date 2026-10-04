# 🎤 Monologue

A phone-first soundboard + stage for telling a story — built for one specific
bachelorette-party recap, but works for any monologue.

## What's in it

| Tab | What it does |
| --- | --- |
| 🔊 **Sounds** | 55 real recorded sound effects (air horn, vine boom, "oh my god", laugh track, crickets, dun-dun-DUNNN, sad trombone, wedding march…), a configurable **Quick fire** row, a **hold-to-bleep** censor button, STOP ALL, and **record/upload your own** sounds. |
| 📸 **Photos** | Pull photos from the camera roll, caption + reorder them, tap to throw one full-screen (slow Ken Burns zoom, swipe between). **Dramatic reveal** mode starts blurred and unveils with a 💥. |
| 🎭 **Cast** | *(idea 1)* A card per person in the story — photo, name, one-liner, entrance sound. Tap for a wrestling-style "INTRODUCING…" full-screen entrance. |
| 📝 **Story** | *(idea 2)* Outline the night as beats, each optionally linked to a photo + sound. **Story Mode** shows one beat at a time in big type, auto-fires its sound/photo on Next, runs a timer, and keeps quick-fire sounds + bleep under your thumb. |
| ✨ **FX** | *(idea 3)* Full-screen visual moments for the audience: confetti, flashing APPLAUSE sign, BREAKING NEWS banner (custom headline), CENSORED slam, earthquake screen-shake, spotlight, and judges' scorecards. |

Everything you add (photos, recordings, cast, beats) is stored **on the device only**
(IndexedDB). Nothing is uploaded anywhere.

Tip: on iPhone, open it in Safari → Share → **Add to Home Screen** for a full-screen app.
The screen is kept awake while it's open.

## Why the soundboard is better than the last one

The previous app synthesized every sound with oscillators in the browser, which is
why it sounded thin. This one uses real recordings and a proper engine:

- **Real clips**, downloaded at build time from Myinstants, [Remotion's SFX library](https://www.remotion.dev/docs/sfx),
  Google's [sound library](https://developers.google.com/assistant/tools/sound-library) and
  [react-sounds](https://github.com/e3ntity/react-sounds) (see `sounds.config.json`).
- **Loudness-matched**: `scripts/fetch-sounds.mjs` trims leading silence, caps length,
  measures each clip's EBU R128 loudness and gains it to -16 LUFS behind a brickwall
  limiter, so an air horn and a whisper-quiet "awww" hit at the same perceived volume.
- **Zero-latency playback**: every clip is decoded into a Web Audio buffer up front;
  pads fire on `pointerdown`, overlap freely, and run through a master limiter so stacked
  sounds don't clip.
- **iPhone silent switch**: the audio session is set to `playback` (Safari 17+) so the
  ringer switch doesn't mute the board.

## Develop

```bash
npm install
SFX_PLACEHOLDER=1 npm run build   # offline: generates beep placeholders instead of downloading
npm run dev
```

`npm run build` downloads + normalizes the real sounds (needs internet), writes
`public/sfx/manifest.json`, then builds to `dist/`. If a clip can't be downloaded the
build still succeeds — it falls back to the original URL at runtime when that host allows
CORS, otherwise the pad is left out.

### Adding / swapping sounds

Edit `sounds.config.json`. Each entry is `{ id, label, emoji, cat, src, max, mode }`,
where `src` is `<source prefix>:<path>` (prefixes are defined in `sources`), `max` is the
number of seconds to keep, and `mode: "toggle"` makes a pad loop until tapped again.

### Preloading photos

Drop images into `public/photos/` and redeploy — they're imported into the Photos tab
on each device the first time the app opens.

## Deploy

Hosted on Vercel (project `monologue`), auto-deploying from `main`. Build settings live
in `vercel.json`.
