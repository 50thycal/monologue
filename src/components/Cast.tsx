import { useState } from "react";
import { uid, type Character } from "../db";
import { useApp } from "../store";
import { Modal, PhotoSelect, SoundSelect } from "./ui";

const blank = (order: number): Character => ({ id: uid(), name: "", tagline: "", order });

export function Cast() {
  const { cast, photos, saveCharacter, removeCharacter, setStage, play } = useApp();
  const [edit, setEdit] = useState<Character | null>(null);
  const photoUrl = (id?: string) => photos.find((p) => p.id === id)?.url;

  return (
    <div className="cast">
      <p className="hint">
        Introduce the players. Tap a card mid-story for a full-screen, wrestling-style entrance with their theme sound.
      </p>
      <div className="cast-grid">
        {cast.map((c) => (
          <div key={c.id} className="cast-card">
            <button
              className="cast-main"
              onClick={() => {
                play(c.soundId);
                setStage({ kind: "character", charId: c.id });
              }}
            >
              <div className="avatar">{photoUrl(c.photoId) ? <img src={photoUrl(c.photoId)} alt="" /> : <span>{c.name.slice(0, 1) || "?"}</span>}</div>
              <b>{c.name || "Unnamed"}</b>
              <small>{c.tagline}</small>
            </button>
            <button className="tile-more" onClick={() => setEdit(c)} aria-label="Edit">
              ⋯
            </button>
          </div>
        ))}
        <button className="cast-card add" onClick={() => setEdit(blank(cast.length))}>
          ＋<br />
          Add character
        </button>
      </div>

      {edit && (
        <Modal title={cast.some((c) => c.id === edit.id) ? "Edit character" : "New character"} onClose={() => setEdit(null)}>
          <label className="field">
            Name
            <input autoFocus value={edit.name} maxLength={30} placeholder="e.g. Jess" onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </label>
          <label className="field">
            Title / one-liner
            <input
              value={edit.tagline}
              maxLength={60}
              placeholder="e.g. The Bride. Lost a shoe by 10pm."
              onChange={(e) => setEdit({ ...edit, tagline: e.target.value })}
            />
          </label>
          <PhotoSelect value={edit.photoId} onChange={(photoId) => setEdit({ ...edit, photoId })} />
          <SoundSelect label="Entrance sound" value={edit.soundId} onChange={(soundId) => setEdit({ ...edit, soundId })} />
          <div className="modal-actions">
            {cast.some((c) => c.id === edit.id) && (
              <button
                className="danger"
                onClick={() => {
                  removeCharacter(edit.id);
                  setEdit(null);
                }}
              >
                Delete
              </button>
            )}
            <button
              className="primary"
              onClick={() => {
                saveCharacter({ ...edit, name: edit.name.trim() || "Mystery Guest" });
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
