import { useEffect, useState } from "react";
import { engine } from "./audio";
import { Board, TransportBar } from "./components/Board";
import { Cast } from "./components/Cast";
import { FxBoard } from "./components/FX";
import { Photos } from "./components/Photos";
import { Stage } from "./components/Stage";
import { Story } from "./components/Story";

const TABS = [
  { id: "board", label: "Sounds", icon: "🔊" },
  { id: "photos", label: "Photos", icon: "📸" },
  { id: "cast", label: "Cast", icon: "🎭" },
  { id: "story", label: "Story", icon: "📝" },
  { id: "fx", label: "FX", icon: "✨" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const get = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {}
    };
    const onVis = () => document.visibilityState === "visible" && get();
    get();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, [on]);
}

export function App() {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem("tab") as Tab) || "board");
  const [awake, setAwake] = useState(false);
  useWakeLock(awake);

  useEffect(() => {
    try {
      localStorage.setItem("tab", tab);
    } catch {}
  }, [tab]);

  // Browsers only allow audio after a gesture: unlock on the very first touch.
  useEffect(() => {
    const unlock = () => {
      engine.unlock();
      setAwake(true);
    };
    addEventListener("pointerdown", unlock, { capture: true });
    addEventListener("keydown", unlock, { capture: true });
    return () => {
      removeEventListener("pointerdown", unlock, { capture: true });
      removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);

  return (
    <div className="app">
      <header>
        <h1>
          <span>🎤</span> Monologue
        </h1>
        <TransportBar />
      </header>
      <main>
        {tab === "board" && <Board />}
        {tab === "photos" && <Photos />}
        {tab === "cast" && <Cast />}
        {tab === "story" && <Story />}
        {tab === "fx" && <FxBoard />}
      </main>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? "on" : ""} onClick={() => setTab(t.id)}>
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <Stage />
    </div>
  );
}
