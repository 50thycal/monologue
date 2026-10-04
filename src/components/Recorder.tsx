import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { Modal } from "./ui";

const EMOJIS = ["🎤", "👰", "🍸", "💃", "🕺", "🚕", "🍕", "🤮", "💋", "👠", "🔥", "😭", "🙄", "🫠", "👑", "📣"];
const MAX_SECONDS = 30;

function pickMime() {
  const options = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) ?? "";
}

export function Recorder({ onClose }: { onClose: () => void }) {
  const { addSound } = useApp();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const preview = useRef<HTMLAudioElement | null>(null);
  const previewUrl = useRef<string>("");

  useEffect(
    () => () => {
      rec.current?.stream.getTracks().forEach((t) => t.stop());
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  useEffect(() => {
    if (!recording) return;
    const t0 = Date.now();
    const id = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      setSecs(s);
      if (s >= MAX_SECONDS) rec.current?.stop();
    }, 100);
    return () => clearInterval(id);
  }, [recording]);

  const setResult = (b: Blob) => {
    setBlob(b);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(b);
    if (preview.current) preview.current.src = previewUrl.current;
  };

  const start = async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setResult(new Blob(chunks, { type: r.mimeType || mime || "audio/webm" }));
      };
      rec.current = r;
      r.start();
      setSecs(0);
      setRecording(true);
    } catch (e) {
      setErr("Microphone not available — allow mic access, or upload a file instead.");
    }
  };

  const save = async () => {
    if (!blob) return;
    setBusy(true);
    setErr("");
    try {
      await addSound(blob, label.trim() || "My sound", emoji);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add your own sound" onClose={onClose}>
      <div className="rec">
        {!recording ? (
          <button className="rec-btn" onClick={start}>
            ● {blob ? "Re-record" : "Record"}
          </button>
        ) : (
          <button className="rec-btn live" onClick={() => rec.current?.stop()}>
            ■ Stop ({secs.toFixed(1)}s)
          </button>
        )}
        <span className="or">or</span>
        <label className="file-btn">
          Upload audio
          <input
            type="file"
            accept="audio/*,video/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setResult(f);
                if (!label) setLabel(f.name.replace(/\.[^.]+$/, "").slice(0, 24));
              }
            }}
          />
        </label>
      </div>
      <audio ref={preview} controls className="rec-preview" hidden={!blob} />
      <label className="field">
        Name
        <input value={label} maxLength={24} placeholder="e.g. Sarah's scream" onChange={(e) => setLabel(e.target.value)} />
      </label>
      <div className="emoji-pick">
        {EMOJIS.map((e) => (
          <button key={e} className={e === emoji ? "on" : ""} onClick={() => setEmoji(e)}>
            {e}
          </button>
        ))}
      </div>
      {err && <p className="err">{err}</p>}
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!blob || busy} onClick={save}>
          {busy ? "Saving…" : "Save to board"}
        </button>
      </div>
    </Modal>
  );
}
