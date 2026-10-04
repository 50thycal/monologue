import { useEffect, useState } from "react";
import { uid, type Beat } from "../db";
import { useApp } from "../store";
import { BleepButton, Pad } from "./Board";
import { Modal, PhotoSelect, SoundSelect } from "./ui";

const blank = (order: number): Beat => ({ id: uid(), title: "", notes: "", order });

const STARTER = [
  "Pregame: the outfits",
  "Arrival + first round",
  "The thing nobody saw coming",
  "Peak chaos",
  "The ride home",
  "Lessons learned",
];

export function Story() {
  const { beats, photos, saveBeat, removeBeat, moveBeat } = useApp();
  const [edit, setEdit] = useState<Beat | null>(null);
  const [live, setLive] = useState(false);
  const photoUrl = (id?: string) => photos.find((p) => p.id === id)?.url;

  if (live && beats.length) return <Presenter onExit={() => setLive(false)} />;

  return (
    <div className="story">
      <p className="hint">
        Outline the night as beats. In <b>Story Mode</b> you get one beat at a time in big text, auto-fire its sound/photo
        on Next, and keep your quick-fire sounds right under your thumb.
      </p>
      <button className="primary wide" disabled={!beats.length} onClick={() => setLive(true)}>
        ▶ Start Story Mode
      </button>

      <ol className="beats">
        {beats.map((b, i) => (
          <li key={b.id}>
            <button className="beat-main" onClick={() => setEdit(b)}>
              <span className="beat-n">{i + 1}</span>
              <span className="beat-body">
                <b>{b.title || "Untitled beat"}</b>
                {b.notes && <small>{b.notes}</small>}
              </span>
              {photoUrl(b.photoId) && <img src={photoUrl(b.photoId)} alt="" />}
              {b.soundId && <span className="tag">🔊</span>}
            </button>
            <div className="beat-move">
              <button onClick={() => moveBeat(b.id, -1)} disabled={i === 0} aria-label="Move up">
                ▲
              </button>
              <button onClick={() => moveBeat(b.id, 1)} disabled={i === beats.length - 1} aria-label="Move down">
                ▼
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="row">
        <button className="wide" onClick={() => setEdit(blank(beats.length))}>
          ＋ Add beat
        </button>
        {beats.length === 0 && (
          <button
            className="wide"
            onClick={async () => {
              for (let i = 0; i < STARTER.length; i++) await saveBeat({ ...blank(i), title: STARTER[i] });
            }}
          >
            Use a starter outline
          </button>
        )}
      </div>

      {edit && (
        <Modal title={beats.some((b) => b.id === edit.id) ? "Edit beat" : "New beat"} onClose={() => setEdit(null)}>
          <label className="field">
            Headline
            <input autoFocus value={edit.title} maxLength={60} placeholder="e.g. The limo breaks down" onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          </label>
          <label className="field">
            Notes to self (only you see these)
            <textarea
              rows={3}
              value={edit.notes}
              placeholder="Don't forget: the bouncer, the tiara, the tacos"
              onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
            />
          </label>
          <PhotoSelect value={edit.photoId} onChange={(photoId) => setEdit({ ...edit, photoId })} />
          <SoundSelect value={edit.soundId} onChange={(soundId) => setEdit({ ...edit, soundId })} />
          <div className="modal-actions">
            {beats.some((b) => b.id === edit.id) && (
              <button
                className="danger"
                onClick={() => {
                  removeBeat(edit.id);
                  setEdit(null);
                }}
              >
                Delete
              </button>
            )}
            <button
              className="primary"
              onClick={() => {
                saveBeat(edit);
                setEdit(null);
              }}
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Presenter({ onExit }: { onExit: () => void }) {
  const { beats, photos, favorites, soundById, play, setStage } = useApp();
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const [t0] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const beat = beats[Math.min(i, beats.length - 1)];
  const photo = photos.find((p) => p.id === beat.photoId);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const go = (n: number) => {
    const j = Math.max(0, Math.min(beats.length - 1, n));
    if (j === i) return;
    setI(j);
    const b = beats[j];
    if (auto && j > i) {
      play(b.soundId);
      if (b.photoId) setStage({ kind: "photo", photoId: b.photoId });
    }
  };

  const secs = Math.floor((now - t0) / 1000);
  const favs = favorites.map((id) => soundById.get(id)).filter(Boolean).slice(0, 8);

  return (
    <div className="presenter">
      <div className="pres-top">
        <button onClick={onExit}>✕ Exit</button>
        <span className="muted">
          {i + 1}/{beats.length} · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
        </span>
        <label className="toggle-row">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> auto-fire
        </label>
      </div>
      <div className="pres-beat">
        <h1>{beat.title || "…"}</h1>
        {beat.notes && <p>{beat.notes}</p>}
        <div className="row center">
          {photo && <button onClick={() => setStage({ kind: "photo", photoId: photo.id })}>📸 Show photo</button>}
          {beat.soundId && <button onClick={() => play(beat.soundId)}>🔊 {soundById.get(beat.soundId)?.label ?? "Sound"}</button>}
        </div>
        {beats[i + 1] && <p className="up-next">Next: {beats[i + 1].title}</p>}
      </div>
      <div className="pres-nav">
        <button onClick={() => go(i - 1)} disabled={i === 0}>
          ◀ Back
        </button>
        <button className="primary" onClick={() => go(i + 1)} disabled={i === beats.length - 1}>
          Next ▶
        </button>
      </div>
      <div className="grid quick small">
        {favs.map((s) => (
          <Pad key={s!.id} s={s!} />
        ))}
      </div>
      <BleepButton />
    </div>
  );
}
