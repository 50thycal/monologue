// On-device persistence (IndexedDB). Everything she adds — photos, recorded
// sounds, the cast, the story beats — lives in her browser; nothing is uploaded.

import { createStore, del, entries, get, set } from "idb-keyval";

const store = createStore("monologue", "kv");

export interface Photo {
  id: string;
  blob: Blob;
  caption: string;
  order: number;
  preset?: boolean;
}

export interface CustomSound {
  id: string;
  label: string;
  emoji: string;
  blob: Blob;
  createdAt: number;
}

export interface Character {
  id: string;
  name: string;
  tagline: string;
  photoId?: string;
  soundId?: string;
  order: number;
}

export interface Beat {
  id: string;
  title: string;
  notes: string;
  photoId?: string;
  soundId?: string;
  order: number;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

async function list<T>(prefix: string): Promise<T[]> {
  const all = await entries<string, T>(store);
  return all.filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
}

export const db = {
  photos: () => list<Photo>("photo:"),
  putPhoto: (p: Photo) => set(`photo:${p.id}`, p, store),
  delPhoto: (id: string) => del(`photo:${id}`, store),

  sounds: () => list<CustomSound>("sound:"),
  putSound: (s: CustomSound) => set(`sound:${s.id}`, s, store),
  delSound: (id: string) => del(`sound:${id}`, store),

  cast: () => list<Character>("cast:"),
  putCharacter: (c: Character) => set(`cast:${c.id}`, c, store),
  delCharacter: (id: string) => del(`cast:${id}`, store),

  beats: () => list<Beat>("beat:"),
  putBeat: (b: Beat) => set(`beat:${b.id}`, b, store),
  delBeat: (id: string) => del(`beat:${id}`, store),

  getSetting: <T>(k: string) => get<T>(`setting:${k}`, store),
  setSetting: (k: string, v: unknown) => set(`setting:${k}`, v, store),
};

/** Downscale camera-roll photos so a few dozen fit comfortably in IndexedDB. */
export async function shrinkImage(file: Blob, maxSide = 2048): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5e6) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
  } catch {
    // HEIC on non-Safari etc. — keep the original, the <img> may still render it.
    return file;
  }
}
