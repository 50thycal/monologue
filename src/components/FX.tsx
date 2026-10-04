import { useApp, type FxKind } from "../store";

interface FxDef {
  fx: FxKind;
  label: string;
  emoji: string;
  sound?: string;
  editable?: string;
}

export const FX: FxDef[] = [
  { fx: "confetti", label: "Confetti", emoji: "🎉", sound: "tada" },
  { fx: "applause", label: "Applause Sign", emoji: "👏", sound: "applause" },
  { fx: "breaking", label: "Breaking News", emoji: "📰", sound: "dundundun", editable: "BRIDE-TO-BE SPOTTED ON MECHANICAL BULL" },
  { fx: "censored", label: "CENSORED", emoji: "⬛", editable: "CENSORED" },
  { fx: "shake", label: "Earthquake", emoji: "🫨", sound: "vineboom" },
  { fx: "spotlight", label: "Spotlight", emoji: "🔦", sound: "drumroll", editable: "And then…" },
  { fx: "scorecard", label: "Judges' Scores", emoji: "🧑‍⚖️", sound: "bell" },
];

export function FxBoard() {
  const { setStage, play, fxText, setFxText } = useApp();
  return (
    <div className="fx">
      <p className="hint">Full-screen visual moments. Each comes with a sound; tap anywhere on the screen to dismiss.</p>
      <div className="fx-grid">
        {FX.map((f) => (
          <div key={f.fx} className="fx-card">
            <button
              className="fx-btn"
              onClick={() => {
                if (f.fx === "censored") play("__bleep");
                else play(f.sound);
                setStage({ kind: "fx", fx: f.fx, text: fxText[f.fx] || f.editable });
              }}
            >
              <span className="emoji">{f.emoji}</span>
              {f.label}
            </button>
            {f.editable && (
              <input
                className="fx-text"
                value={fxText[f.fx] ?? f.editable}
                maxLength={80}
                onChange={(e) => setFxText(f.fx, e.target.value)}
                aria-label={`${f.label} text`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
