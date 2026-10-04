import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { engine, trigger, type SoundDef } from "./audio";
import { db, uid, type Beat, type Character, type CustomSound, type Photo } from "./db";

export type FxKind = "confetti" | "applause" | "breaking" | "censored" | "shake" | "spotlight" | "scorecard";

export type Stage =
  | { kind: "photo"; photoId: string; reveal?: boolean }
  | { kind: "character"; charId: string }
  | { kind: "fx"; fx: FxKind; text?: string };

interface PhotoView extends Photo {
  url: string;
}

interface Ctx {
  categories: string[];
  sounds: SoundDef[];
  soundById: Map<string, SoundDef>;
  loaded: number;
  total: number;
  photos: PhotoView[];
  cast: Character[];
  beats: Beat[];
  stage: Stage | null;
  fxText: Record<string, string>;
  favorites: string[];
  setStage: (s: Stage | null) => void;
  play: (soundId?: string) => void;
  addPhotos: (blobs: Blob[]) => Promise<void>;
  updatePhoto: (p: Photo) => Promise<void>;
  removePhoto: (id: string) => Promise<void>;
  movePhoto: (id: string, dir: -1 | 1) => Promise<void>;
  addSound: (blob: Blob, label: string, emoji: string) => Promise<void>;
  removeSound: (id: string) => Promise<void>;
  saveCharacter: (c: Character) => Promise<void>;
  removeCharacter: (id: string) => Promise<void>;
  saveBeat: (b: Beat) => Promise<void>;
  removeBeat: (id: string) => Promise<void>;
  moveBeat: (id: string, dir: -1 | 1) => Promise<void>;
  setFxText: (fx: string, text: string) => void;
  toggleFavorite: (id: string) => void;
}

const C = createContext<Ctx>(null!);
export const useApp = () => useContext(C);

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
const customDef = (s: CustomSound): SoundDef => ({ id: s.id, label: s.label, emoji: s.emoji, cat: "Mine", mode: "shot", url: "", custom: true });

export function AppProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<string[]>([]);
  const [builtin, setBuiltin] = useState<SoundDef[]>([]);
  const [custom, setCustom] = useState<SoundDef[]>([]);
  const [loaded, setLoaded] = useState(0);
  const [photos, setPhotos] = useState<PhotoView[]>([]);
  const [cast, setCast] = useState<Character[]>([]);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [stage, setStage] = useState<Stage | null>(null);
  const [fxText, setFxTextState] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const urls = useRef(new Map<string, string>());

  const view = useCallback((p: Photo): PhotoView => {
    let url = urls.current.get(p.id);
    if (!url) {
      url = URL.createObjectURL(p.blob);
      urls.current.set(p.id, url);
    }
    return { ...p, url };
  }, []);

  // Boot: manifest + preset photos + everything saved on this device.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [savedPhotos, savedSounds, savedCast, savedBeats, fav, fxt] = await Promise.all([
        db.photos(),
        db.sounds(),
        db.cast(),
        db.beats(),
        db.getSetting<string[]>("favorites"),
        db.getSetting<Record<string, string>>("fxText"),
      ]);
      if (cancelled) return;
      setCast(savedCast.sort(byOrder));
      setBeats(savedBeats.sort(byOrder));
      setFavorites(fav ?? ["airhorn", "vineboom", "omg", "dundundun", "laugh", "applause", "scratch", "crickets"]);
      setFxTextState(fxt ?? {});

      // Preset photos dropped into public/photos/ (see README) are imported once.
      const known = new Set(savedPhotos.map((p) => p.id));
      try {
        const manifest: string[] = await (await fetch("/photos/manifest.json")).json();
        let order = savedPhotos.length;
        for (const file of manifest) {
          const id = `preset-${file}`;
          if (known.has(id)) continue;
          const blob = await (await fetch(`/photos/${encodeURIComponent(file)}`)).blob();
          const p: Photo = { id, blob, caption: "", order: order++, preset: true };
          await db.putPhoto(p);
          savedPhotos.push(p);
        }
      } catch {}
      if (cancelled) return;
      setPhotos(savedPhotos.sort(byOrder).map(view));

      const customDefs = savedSounds.sort((a, b) => a.createdAt - b.createdAt).map(customDef);
      setCustom(customDefs);
      let done = 0;
      const bump = () => !cancelled && setLoaded(++done);
      savedSounds.forEach((s) => engine.load(s.id, s.blob).then(bump));

      try {
        const m: { categories: string[]; sounds: SoundDef[] } = await (await fetch("/sfx/manifest.json")).json();
        if (cancelled) return;
        setCategories(m.categories);
        setBuiltin(m.sounds);
        // Favorites first so the quick row is ready soonest.
        const favSet = new Set(fav ?? []);
        const ordered = [...m.sounds].sort((a, b) => Number(favSet.has(b.id)) - Number(favSet.has(a.id)));
        let i = 0;
        await Promise.all(
          Array.from({ length: 6 }, async () => {
            while (i < ordered.length) {
              const s = ordered[i++];
              await engine.load(s.id, s.url);
              bump();
            }
          }),
        );
      } catch (e) {
        console.error("sound manifest failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view]);

  const sounds = useMemo(() => [...builtin, ...custom], [builtin, custom]);
  const soundById = useMemo(() => new Map(sounds.map((s) => [s.id, s])), [sounds]);

  const play = useCallback(
    (soundId?: string) => {
      if (!soundId) return;
      if (soundId === "__bleep") {
        engine.bleepOn();
        setTimeout(() => engine.bleepOff(), 900);
        return;
      }
      const s = soundById.get(soundId);
      if (s) trigger(s);
    },
    [soundById],
  );

  const addPhotos = useCallback(
    async (blobs: Blob[]) => {
      const start = photos.length ? Math.max(...photos.map((p) => p.order)) + 1 : 0;
      const added: PhotoView[] = [];
      for (let i = 0; i < blobs.length; i++) {
        const p: Photo = { id: uid(), blob: blobs[i], caption: "", order: start + i };
        await db.putPhoto(p);
        added.push(view(p));
      }
      setPhotos((ps) => [...ps, ...added]);
    },
    [photos, view],
  );

  const updatePhoto = useCallback(
    async (p: Photo) => {
      const { url: _u, ...plain } = p as PhotoView;
      await db.putPhoto(plain);
      setPhotos((ps) => ps.map((x) => (x.id === p.id ? view(plain) : x)));
    },
    [view],
  );

  const removePhoto = useCallback(async (id: string) => {
    await db.delPhoto(id);
    const url = urls.current.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.current.delete(id);
    setPhotos((ps) => ps.filter((p) => p.id !== id));
  }, []);

  const movePhoto = useCallback(
    async (id: string, dir: -1 | 1) => {
      const i = photos.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= photos.length) return;
      const next = [...photos];
      [next[i], next[j]] = [next[j], next[i]];
      const renumbered = next.map((p, k) => ({ ...p, order: k }));
      setPhotos(renumbered);
      await Promise.all(renumbered.map(({ url: _u, ...p }) => db.putPhoto(p)));
    },
    [photos],
  );

  const addSound = useCallback(async (blob: Blob, label: string, emoji: string) => {
    const s: CustomSound = { id: `mine-${uid()}`, label, emoji, blob, createdAt: Date.now() };
    const buf = await engine.load(s.id, blob);
    if (!buf) throw new Error("Couldn't decode that audio file.");
    await db.putSound(s);
    setCustom((cs) => [...cs, customDef(s)]);
  }, []);

  const removeSound = useCallback(async (id: string) => {
    await db.delSound(id);
    engine.forget(id);
    setCustom((cs) => cs.filter((s) => s.id !== id));
  }, []);

  const saveCharacter = useCallback(async (c: Character) => {
    await db.putCharacter(c);
    setCast((cs) => (cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? c : x)) : [...cs, c]).sort(byOrder));
  }, []);

  const removeCharacter = useCallback(async (id: string) => {
    await db.delCharacter(id);
    setCast((cs) => cs.filter((c) => c.id !== id));
  }, []);

  const saveBeat = useCallback(async (b: Beat) => {
    await db.putBeat(b);
    setBeats((bs) => (bs.some((x) => x.id === b.id) ? bs.map((x) => (x.id === b.id ? b : x)) : [...bs, b]).sort(byOrder));
  }, []);

  const removeBeat = useCallback(async (id: string) => {
    await db.delBeat(id);
    setBeats((bs) => bs.filter((b) => b.id !== id));
  }, []);

  const moveBeat = useCallback(
    async (id: string, dir: -1 | 1) => {
      const i = beats.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= beats.length) return;
      const next = [...beats];
      [next[i], next[j]] = [next[j], next[i]];
      const renumbered = next.map((b, k) => ({ ...b, order: k }));
      setBeats(renumbered);
      await Promise.all(renumbered.map((b) => db.putBeat(b)));
    },
    [beats],
  );

  const setFxText = useCallback((fx: string, text: string) => {
    setFxTextState((t) => {
      const next = { ...t, [fx]: text };
      void db.setSetting("fxText", next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      void db.setSetting("favorites", next);
      return next;
    });
  }, []);

  const value: Ctx = {
    categories,
    sounds,
    soundById,
    loaded,
    total: sounds.length,
    photos,
    cast,
    beats,
    stage,
    fxText,
    favorites,
    setStage,
    play,
    addPhotos,
    updatePhoto,
    removePhoto,
    movePhoto,
    addSound,
    removeSound,
    saveCharacter,
    removeCharacter,
    saveBeat,
    removeBeat,
    moveBeat,
    setFxText,
    toggleFavorite,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
