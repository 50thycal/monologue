import { useState } from "react";
import { shrinkImage } from "../db";
import { useApp } from "../store";
import { Modal } from "./ui";

export function Photos() {
  const { photos, addPhotos, setStage, updatePhoto, removePhoto, movePhoto } = useApp();
  const [busy, setBusy] = useState(0);
  const [editId, setEditId] = useState<string | null>(null);
  const [revealMode, setRevealMode] = useState(false);
  const editing = photos.find((p) => p.id === editId);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    setBusy(list.length);
    const blobs: Blob[] = [];
    for (const f of list) {
      blobs.push(await shrinkImage(f));
      setBusy((n) => n - 1);
    }
    await addPhotos(blobs);
    setBusy(0);
  };

  return (
    <div className="photos">
      <div className="photo-tools">
        <label className="file-btn primary">
          {busy ? `Adding… ${busy} left` : "＋ Add photos"}
          <input type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        </label>
        <label className="toggle-row">
          <input type="checkbox" checked={revealMode} onChange={(e) => setRevealMode(e.target.checked)} />
          Dramatic reveal
        </label>
      </div>
      <p className="hint">
        Tap a photo to throw it full-screen. {revealMode ? "Reveal mode: it starts blurred — tap again to unveil with a 💥." : ""}
      </p>

      {photos.length === 0 && (
        <p className="empty">No photos yet. Add some from your camera roll — they stay on this device only.</p>
      )}

      <div className="photo-grid">
        {photos.map((p, i) => (
          <div key={p.id} className="photo-tile">
            <button className="photo-img" onClick={() => setStage({ kind: "photo", photoId: p.id, reveal: revealMode })}>
              <img src={p.url} alt={p.caption} loading="lazy" />
              <span className="num">{i + 1}</span>
              {p.caption && <span className="cap">{p.caption}</span>}
            </button>
            <button className="tile-more" onClick={() => setEditId(p.id)} aria-label="Edit photo">
              ⋯
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <Modal title="Photo" onClose={() => setEditId(null)}>
          <img className="edit-preview" src={editing.url} alt="" />
          <label className="field">
            Caption (shown on screen)
            <input
              defaultValue={editing.caption}
              maxLength={80}
              placeholder="e.g. 1:47am — the mechanical bull"
              onBlur={(e) => updatePhoto({ ...editing, caption: e.target.value })}
            />
          </label>
          <div className="modal-actions spread">
            <button onClick={() => movePhoto(editing.id, -1)}>← Earlier</button>
            <button onClick={() => movePhoto(editing.id, 1)}>Later →</button>
            <button
              className="danger"
              onClick={() => {
                if (confirm("Remove this photo?")) {
                  removePhoto(editing.id);
                  setEditId(null);
                }
              }}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
