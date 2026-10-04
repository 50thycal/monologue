import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { buzz, engine, trigger, type SoundDef } from "../audio";
import { useApp } from "../store";
import { Recorder } from "./Recorder";

let tick = 0;
const subscribe = (fn: () => void) =>
  engine.subscribe(() => {
    tick++;
    fn();
  });
/** Re-render whenever any voice starts/stops. */
export const useEngine = () => useSyncExternalStore(subscribe, () => tick);

export function Pad({ s, big, editing }: { s: SoundDef; big?: boolean; editing?: boolean }) {
  useEngine();
  const { favorites, toggleFavorite, removeSound } = useApp();
  const ref = useRef<HTMLButtonElement>(null);
  const playing = engine.playing(s.id);
  const ready = engine.isLoaded(s.id);

  // Progress ring, driven straight on the DOM so playback never waits on React.
  useEffect(() => {
    if (!playing || s.mode === "toggle") return;
    let raf = 0;
    const step = () => {
      const p = engine.progress(s.id);
      ref.current?.style.setProperty("--p", String(Math.max(0, p)));
      if (p >= 0) raf = requestAnimationFrame(step);
    };
    step();
    return () => {
      cancelAnimationFrame(raf);
      ref.current?.style.setProperty("--p", "0");
    };
  }, [playing, s.id, s.mode]);

  const fav = favorites.includes(s.id);
  return (
    <div className={`pad-wrap${big ? " big" : ""}`}>
      <button
        ref={ref}
        className={`pad cat-${s.cat.toLowerCase()}${playing ? " playing" : ""}${ready ? "" : " loading"}${s.mode === "toggle" ? " toggle" : ""}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          if (editing) return;
          buzz();
          trigger(s);
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={s.label}
      >
        <span className="emoji">{s.emoji}</span>
        <span className="label">{s.label}</span>
        {s.mode === "toggle" && <span className="mode">{playing ? "■ stop" : "♪ loop"}</span>}
      </button>
      {editing && (
        <div className="pad-edit">
          <button className={fav ? "on" : ""} onClick={() => toggleFavorite(s.id)} aria-label="Favorite">
            {fav ? "★" : "☆"}
          </button>
          {s.custom && (
            <button onClick={() => confirm(`Delete "${s.label}"?`) && removeSound(s.id)} aria-label="Delete">
              🗑
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function BleepButton() {
  useEngine();
  const on = engine.bleeping;
  const up = () => engine.bleepOff();
  return (
    <button
      className={`bleep${on ? " on" : ""}`}
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          // Keep the tone going even if her thumb slides off the button.
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {}
        buzz(15);
        engine.bleepOn();
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {on ? "████ BLEEEEP ████" : "🤬 HOLD TO BLEEP"}
    </button>
  );
}

export function TransportBar() {
  useEngine();
  const [vol, setVol] = useState(() => Number(localStorage.getItem("vol") ?? 0.9));
  useEffect(() => {
    engine.setVolume(vol);
    try {
      localStorage.setItem("vol", String(vol));
    } catch {}
  }, [vol]);
  return (
    <div className="transport">
      <label className="vol">
        <span>{vol === 0 ? "🔇" : vol < 0.5 ? "🔉" : "🔊"}</span>
        <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(Number(e.target.value))} />
      </label>
      <button className={`stop-all${engine.anyPlaying ? " live" : ""}`} onPointerDown={() => engine.stopAll()}>
        ■ STOP ALL
      </button>
    </div>
  );
}

export function Board() {
  const { categories, sounds, favorites, soundById, loaded, total } = useApp();
  const [cat, setCat] = useState<string>("All");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [recOpen, setRecOpen] = useState(false);

  const cats = useMemo(() => ["All", ...categories, "Mine"], [categories]);
  const favs = favorites.map((id) => soundById.get(id)).filter(Boolean) as SoundDef[];
  const list = sounds.filter(
    (s) => (cat === "All" || s.cat === cat) && (!q || s.label.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="board">
      {total > 0 && loaded < total && (
        <div className="loadbar" aria-label="Loading sounds">
          <div style={{ width: `${(loaded / total) * 100}%` }} />
          <span>
            Loading sounds {loaded}/{total}
          </span>
        </div>
      )}

      {favs.length > 0 && (
        <section>
          <h2>
            Quick fire <small>{editing ? "tap ☆ on any pad to add/remove" : ""}</small>
          </h2>
          <div className="grid quick">
            {favs.map((s) => (
              <Pad key={s.id} s={s} big editing={editing} />
            ))}
          </div>
        </section>
      )}

      <BleepButton />

      <div className="chips">
        {cats.map((c) => (
          <button key={c} className={c === cat ? "on" : ""} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="board-tools">
        <input className="search" placeholder="Search sounds…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={editing ? "on" : ""} onClick={() => setEditing((v) => !v)}>
          {editing ? "Done" : "✎ Edit"}
        </button>
        <button onClick={() => setRecOpen(true)}>＋ Add</button>
      </div>

      <div className="grid">
        {list.map((s) => (
          <Pad key={s.id} s={s} editing={editing} />
        ))}
      </div>
      {cat === "Mine" && list.length === 0 && (
        <p className="empty">
          Record your own sounds (an impression of the bride, the DJ yelling "last call"...) or upload audio files. Tap
          <b> ＋ Add</b>.
        </p>
      )}

      {recOpen && <Recorder onClose={() => setRecOpen(false)} />}
    </div>
  );
}
