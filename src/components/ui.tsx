import { useEffect, type ReactNode } from "react";
import { useApp } from "../store";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SoundSelect({ value, onChange, label = "Sound" }: { value?: string; onChange: (id?: string) => void; label?: string }) {
  const { sounds, categories, play } = useApp();
  const groups = [...categories, "Mine"];
  return (
    <label className="field">
      {label}
      <div className="row">
        <select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">— none —</option>
          {groups.map((g) => {
            const items = sounds.filter((s) => s.cat === g);
            return items.length ? (
              <optgroup key={g} label={g}>
                {items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.emoji} {s.label}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
        <button type="button" disabled={!value} onClick={() => play(value)} aria-label="Preview sound">
          ▶
        </button>
      </div>
    </label>
  );
}

export function PhotoSelect({ value, onChange }: { value?: string; onChange: (id?: string) => void }) {
  const { photos } = useApp();
  return (
    <div className="field">
      Photo
      {photos.length === 0 ? (
        <small className="muted">Add photos in the Photos tab first.</small>
      ) : (
        <div className="photo-strip">
          <button type="button" className={!value ? "on none" : "none"} onClick={() => onChange(undefined)}>
            none
          </button>
          {photos.map((p) => (
            <button type="button" key={p.id} className={p.id === value ? "on" : ""} onClick={() => onChange(p.id)}>
              <img src={p.url} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
