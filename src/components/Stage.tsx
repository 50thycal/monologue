import { useEffect, useRef, useState } from "react";
import { engine } from "../audio";
import { useApp } from "../store";

/** Full-screen "audience view" layer: photos, character entrances, visual FX. */
export function Stage() {
  const { stage, setStage } = useApp();
  if (!stage) return null;
  const close = () => setStage(null);
  if (stage.kind === "photo") return <PhotoStage key={stage.photoId} photoId={stage.photoId} reveal={!!stage.reveal} onClose={close} />;
  if (stage.kind === "character") return <CharacterStage charId={stage.charId} onClose={close} />;
  return <FxStage fx={stage.fx} text={stage.text} onClose={close} />;
}

function PhotoStage({ photoId, reveal, onClose }: { photoId: string; reveal: boolean; onClose: () => void }) {
  const { photos, setStage, play } = useApp();
  const [hidden, setHidden] = useState(reveal);
  const touch = useRef<number | null>(null);
  const i = photos.findIndex((p) => p.id === photoId);
  const p = photos[i];

  const go = (d: number) => {
    const next = photos[(i + d + photos.length) % photos.length];
    if (next) setStage({ kind: "photo", photoId: next.id, reveal });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  if (!p) return null;
  return (
    <div
      className="stage photo-stage"
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
      onClick={() => {
        if (hidden) {
          setHidden(false);
          play("vineboom");
        } else onClose();
      }}
    >
      <img src={p.url} alt={p.caption} className={hidden ? "veiled" : "kenburns"} />
      {hidden && <div className="veil-label">TAP TO REVEAL</div>}
      {p.caption && !hidden && <div className="stage-caption">{p.caption}</div>}
      {photos.length > 1 && (
        <>
          <button className="nav prev" onClick={(e) => (e.stopPropagation(), go(-1))} aria-label="Previous">
            ‹
          </button>
          <button className="nav next" onClick={(e) => (e.stopPropagation(), go(1))} aria-label="Next">
            ›
          </button>
        </>
      )}
      <button className="stage-close" onClick={(e) => (e.stopPropagation(), onClose())} aria-label="Close">
        ✕
      </button>
    </div>
  );
}

function CharacterStage({ charId, onClose }: { charId: string; onClose: () => void }) {
  const { cast, photos } = useApp();
  const c = cast.find((x) => x.id === charId);
  if (!c) return null;
  const url = photos.find((p) => p.id === c.photoId)?.url;
  return (
    <div className="stage char-stage" onClick={onClose}>
      <div className="char-intro">INTRODUCING</div>
      <div className="char-photo">{url ? <img src={url} alt="" /> : <span>{c.name.slice(0, 1)}</span>}</div>
      <div className="char-name">{c.name}</div>
      {c.tagline && <div className="char-tag">{c.tagline}</div>}
    </div>
  );
}

function FxStage({ fx, text, onClose }: { fx: string; text?: string; onClose: () => void }) {
  // Earthquake shakes the whole app and gets out of the way on its own.
  useEffect(() => {
    if (fx !== "shake") return;
    document.body.classList.add("quake");
    const t = setTimeout(() => {
      document.body.classList.remove("quake");
      onClose();
    }, 1200);
    return () => {
      clearTimeout(t);
      document.body.classList.remove("quake");
    };
  }, [fx, onClose]);

  useEffect(() => () => engine.bleepOff(), []);

  if (fx === "shake") return null;
  return (
    <div className={`stage fx-stage fx-${fx}`} onClick={onClose}>
      {fx === "confetti" && <Confetti />}
      {fx === "applause" && <div className="applause-sign">APPLAUSE</div>}
      {fx === "breaking" && (
        <div className="breaking">
          <div className="breaking-tag">BREAKING NEWS</div>
          <div className="breaking-text">{text}</div>
          <div className="ticker">
            <span>
              LIVE • {text} • SOURCES CONFIRM "IT WAS A LOT" • MORE AT 11 • LIVE • {text} • WITNESSES SPEECHLESS •
            </span>
          </div>
        </div>
      )}
      {fx === "censored" && (
        <div className="censored">
          <div className="bar" />
          <div className="censored-text">{text}</div>
          <div className="bar" />
        </div>
      )}
      {fx === "spotlight" && <div className="spot-text">{text}</div>}
      {fx === "scorecard" && <Scores />}
    </div>
  );
}

function Scores() {
  const [scores] = useState(() => [0, 0, 0].map(() => (Math.random() < 0.15 ? 11 : 8 + Math.floor(Math.random() * 3))));
  return (
    <div className="scores">
      {scores.map((s, i) => (
        <div key={i} className="score" style={{ animationDelay: `${i * 0.35}s` }}>
          {s}
        </div>
      ))}
      <div className="scores-label">THE JUDGES HAVE SPOKEN</div>
    </div>
  );
}

function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = devicePixelRatio || 1;
    const resize = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    };
    resize();
    const colors = ["#ff3d7f", "#ffd23f", "#3dd6ff", "#7cff6b", "#b46bff", "#ffffff"];
    const parts = Array.from({ length: 220 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 80,
      y: innerHeight * 0.65,
      vx: (Math.random() - 0.5) * 16,
      vy: -10 - Math.random() * 14,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      c: colors[(Math.random() * colors.length) | 0],
    }));
    let raf = 0;
    const step = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      raf = requestAnimationFrame(step);
    };
    step();
    addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
    };
  }, []);
  return <canvas ref={ref} className="confetti" />;
}
