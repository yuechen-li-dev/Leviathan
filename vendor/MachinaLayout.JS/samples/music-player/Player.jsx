import { useState, useEffect, useRef, useMemo, memo } from "react";
import { resolveLayoutRows, MachinaReactView } from "machinalayout";

/* ─── tokens ─── */
const C = {
  bg: "#0e0c0a",
  panel: "#141210",
  card: "#1a1714",
  border: "#2a2420",
  accent: "#e86b2e",
  adim: "rgba(232,107,46,0.10)",
  text: "#4a3f38",
  mid: "#7a6a60",
  bright: "#d4c4b8",
  white: "#f0e8e0",
};
const F = "'DM Mono', monospace";
const FS = "'Playfair Display', serif";

/* ─── data ─── */
const TRACKS = [
  { id: 1, title: "Vanishing Point", artist: "Burial", dur: "5:42", bpm: 140 },
  { id: 2, title: "Archangel", artist: "Burial", dur: "4:34", bpm: 138 },
  { id: 3, title: "Shell of Light", artist: "Burial", dur: "5:11", bpm: 136 },
  { id: 4, title: "Endorphin", artist: "Burial", dur: "6:02", bpm: 142 },
  { id: 5, title: "Rough Sleeper", artist: "Burial", dur: "7:14", bpm: 137 },
  { id: 6, title: "Come Down to Us", artist: "Burial", dur: "9:48", bpm: 133 },
];

/* ─── waveform ─── */
function Waveform({ playing, progress }) {
  const bars = 48;
  const heights = useMemo(
    () =>
      Array.from(
        { length: bars },
        (_, i) =>
          20 + Math.abs(Math.sin(i * 0.7 + i * i * 0.02)) * 55 + Math.abs(Math.sin(i * 1.3)) * 20,
      ),
    [],
  );
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${bars * 5} 80`} preserveAspectRatio="none">
      {heights.map((h, i) => {
        const pct = i / bars;
        const past = pct < progress;
        return (
          <rect
            key={i}
            x={i * 5}
            y={(80 - h) / 2}
            width={3}
            height={h}
            fill={past ? C.accent : C.border}
            opacity={past ? 1 : 0.5}
            style={{ transition: "fill 0.3s ease" }}
          />
        );
      })}
      {/* playhead */}
      <line
        x1={progress * bars * 5}
        y1={0}
        x2={progress * bars * 5}
        y2={80}
        stroke={C.white}
        strokeWidth={1.5}
        opacity={playing ? 1 : 0.4}
      />
    </svg>
  );
}

/* ─── vinyl ─── */
function Vinyl({ playing, trackId }) {
  const rotRef = useRef(0);
  const lastTRef = useRef(null);
  const [rot, setRot] = useState(0);

  useEffect(() => {
    if (!playing) {
      lastTRef.current = null;
      return;
    }
    let raf;
    const tick = (t) => {
      if (lastTRef.current != null) {
        rotRef.current += (t - lastTRef.current) * 0.04;
        setRot(rotRef.current % 360);
      }
      lastTRef.current = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const sz = 120;
  const r = sz / 2;
  const rings = [0.95, 0.82, 0.7, 0.58, 0.46, 0.34];

  return (
    <svg
      width={sz}
      height={sz}
      viewBox={`0 0 ${sz} ${sz}`}
      style={{ transform: `rotate(${rot}deg)`, flexShrink: 0 }}
    >
      <circle cx={r} cy={r} r={r} fill="#111" />
      {rings.map((f, i) => (
        <circle
          key={i}
          cx={r}
          cy={r}
          r={r * f}
          fill="none"
          stroke="#222"
          strokeWidth={i === 0 ? 1.5 : 0.8}
        />
      ))}
      {/* grooves */}
      {Array.from({ length: 24 }, (_, i) => (
        <circle
          key={`g${i}`}
          cx={r}
          cy={r}
          r={r * (0.34 + i * 0.026)}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth={0.4}
        />
      ))}
      <circle cx={r} cy={r} r={r * 0.22} fill={C.accent} opacity={0.9} />
      <circle cx={r} cy={r} r={r * 0.14} fill="#0e0c0a" />
      <circle cx={r} cy={r} r={3} fill={C.mid} />
      {/* label text */}
      <text
        x={r}
        y={r - 8}
        textAnchor="middle"
        fill={C.bg}
        fontSize={5}
        fontFamily={F}
        letterSpacing={1}
      >
        BURIAL
      </text>
      <text
        x={r}
        y={r + 5}
        textAnchor="middle"
        fill={C.bg}
        fontSize={3.5}
        fontFamily={F}
        opacity={0.7}
      >
        ANTIDAWN EP
      </text>
    </svg>
  );
}

/* ─── slot components ─── */

const TrackListSlot = memo(({ viewData }) => {
  const data = viewData ?? {};
  const { tracks = [], activeId, onSelect = () => {} } = data;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: C.panel,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        fontFamily: F,
        boxSizing: "border-box",
      }}
    >
      <div style={{ padding: "20px 18px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ color: C.text, fontSize: 8, letterSpacing: 3, marginBottom: 6 }}>
          PLAYLIST
        </div>
        <div style={{ color: C.bright, fontFamily: FS, fontSize: 15, letterSpacing: 0.5 }}>
          Antidawn EP
        </div>
        <div style={{ color: C.text, fontSize: 8, marginTop: 3, letterSpacing: 1 }}>
          BURIAL · 2021 · {tracks.length} TRACKS
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {tracks.map((t, i) => {
          const active = t.id === activeId;
          return (
            <div
              key={t.id}
              onClick={() => onSelect(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 18px",
                gap: 12,
                cursor: "pointer",
                background: active ? C.adim : "transparent",
                borderLeft: `2px solid ${active ? C.accent : "transparent"}`,
                transition: "background 0.15s",
              }}
            >
              <span
                style={{
                  color: active ? C.accent : C.text,
                  fontSize: 8,
                  fontFamily: F,
                  width: 14,
                  flexShrink: 0,
                }}
              >
                {active ? "▶" : String(i + 1).padStart(2, "0")}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: active ? C.white : C.bright,
                    fontSize: 10,
                    letterSpacing: 0.3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.title}
                </div>
                <div style={{ color: C.text, fontSize: 8, marginTop: 2, letterSpacing: 1 }}>
                  {t.bpm} BPM
                </div>
              </div>
              <span style={{ color: C.text, fontSize: 8, flexShrink: 0 }}>{t.dur}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const PlayerSlot = memo(({ viewData }) => {
  const data = viewData ?? {};
  const { track = TRACKS[0], playing = false, progress = 0, onPlayPause, onSeek = () => {} } = data;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: C.bg,
        display: "flex",
        flexDirection: "column",
        fontFamily: F,
        boxSizing: "border-box",
        padding: "28px 32px 0",
      }}
    >
      {/* top: vinyl + meta */}
      <div style={{ display: "flex", gap: 28, alignItems: "center", marginBottom: 28 }}>
        <Vinyl playing={playing} trackId={track.id} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 8, letterSpacing: 3, marginBottom: 8 }}>
            NOW PLAYING
          </div>
          <div
            style={{
              color: C.white,
              fontFamily: FS,
              fontSize: 22,
              lineHeight: 1.2,
              marginBottom: 6,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {track.title}
          </div>
          <div style={{ color: C.mid, fontSize: 10, letterSpacing: 1 }}>{track.artist}</div>

          <div style={{ display: "flex", gap: 16, marginTop: 14 }}>
            {[
              ["BPM", track.bpm],
              ["KEY", "D♭m"],
              ["TIME", "4/4"],
            ].map(([l, v]) => (
              <div key={l}>
                <div style={{ color: C.text, fontSize: 7, letterSpacing: 2 }}>{l}</div>
                <div style={{ color: C.bright, fontSize: 11, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* waveform */}
      <div
        style={{ height: 60, marginBottom: 14, cursor: "pointer" }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek((e.clientX - r.left) / r.width);
        }}
      >
        <Waveform playing={playing} progress={progress} />
      </div>

      {/* time */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: C.text,
          fontSize: 8,
          letterSpacing: 1,
          marginBottom: 20,
        }}
      >
        <span>{formatTime(progress, track.dur)}</span>
        <span>{track.dur}</span>
      </div>
    </div>
  );
});

const ControlsSlot = memo(({ viewData }) => {
  const data = viewData ?? {};
  const { playing = false, onPlayPause = () => {}, onPrev = () => {}, onNext = () => {} } = data;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: C.card,
        borderTop: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        fontFamily: F,
        boxSizing: "border-box",
        padding: "0 32px",
      }}
    >
      {[
        { label: "⏮", action: onPrev, size: 13 },
        { label: playing ? "⏸" : "⏵", action: onPlayPause, size: 22, accent: true },
        { label: "⏭", action: onNext, size: 13 },
      ].map(({ label, action, size, accent }) => (
        <button
          key={label}
          onClick={action}
          style={{
            background: accent ? C.accent : "transparent",
            border: accent ? "none" : `1px solid ${C.border}`,
            color: accent ? C.bg : C.mid,
            width: accent ? 46 : 34,
            height: accent ? 46 : 34,
            cursor: "pointer",
            fontSize: size,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s",
            flexShrink: 0,
          }}
        >
          {label}
        </button>
      ))}

      {/* volume */}
      <div
        style={{ position: "absolute", right: 32, display: "flex", alignItems: "center", gap: 8 }}
      >
        <span style={{ color: C.text, fontSize: 9 }}>◁</span>
        <div style={{ width: 60, height: 2, background: C.border, position: "relative" }}>
          <div style={{ width: "70%", height: "100%", background: C.mid }} />
        </div>
      </div>
    </div>
  );
});

/* ─── helpers ─── */
function formatTime(progress, durStr) {
  const [m, s] = durStr.split(":").map(Number);
  const total = m * 60 + s;
  const cur = Math.floor(progress * total);
  return `${Math.floor(cur / 60)}:${String(cur % 60).padStart(2, "0")}`;
}

/* ─── root ─── */
export default function Player() {
  const W = 680,
    H = 440;
  const SIDEBAR_W = 220;
  const CONTROLS_H = 70;

  const [activeId, setActiveId] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const track = TRACKS.find((t) => t.id === activeId);

  // tick
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setProgress((p) => {
        if (p >= 1) {
          setPlaying(false);
          return 0;
        }
        return p + 0.001;
      });
    }, 80);
    return () => clearInterval(t);
  }, [playing]);

  const onSelect = (id) => {
    setActiveId(id);
    setProgress(0);
    setPlaying(true);
  };
  const onPrev = () =>
    onSelect(
      TRACKS[(TRACKS.findIndex((t) => t.id === activeId) - 1 + TRACKS.length) % TRACKS.length].id,
    );
  const onNext = () =>
    onSelect(TRACKS[(TRACKS.findIndex((t) => t.id === activeId) + 1) % TRACKS.length].id);

  // stable data refs via useMemo keyed on actual values
  const trackListData = useMemo(
    () => ({ tracks: TRACKS, activeId, onSelect }),
    [activeId, onSelect],
  );
  const playerData = useMemo(
    () => ({
      track,
      playing,
      progress,
      onPlayPause: () => setPlaying((p) => !p),
      onSeek: setProgress,
    }),
    [track, playing, progress],
  );
  const controlsData = useMemo(
    () => ({ playing, onPlayPause: () => setPlaying((p) => !p), onPrev, onNext }),
    [playing, onPrev, onNext],
  );

  const rows = useMemo(
    () => [
      { id: "root", frame: { kind: "root" } },
      {
        id: "sidebar",
        parent: "root",
        frame: { kind: "anchor", left: 0, top: 0, bottom: 0, width: SIDEBAR_W },
        view: "tracklist",
      },
      {
        id: "main",
        parent: "root",
        frame: { kind: "anchor", left: SIDEBAR_W, top: 0, right: 0, bottom: 0 },
      },
      {
        id: "player",
        parent: "main",
        frame: { kind: "anchor", left: 0, top: 0, right: 0, bottom: CONTROLS_H },
        view: "player",
      },
      {
        id: "controls",
        parent: "main",
        frame: { kind: "anchor", left: 0, right: 0, bottom: 0, height: CONTROLS_H },
        view: "controls",
      },
    ],
    [],
  );

  const layout = useMemo(
    () => resolveLayoutRows(rows, { x: 0, y: 0, width: W, height: H }),
    [rows],
  );

  const views = useMemo(
    () => ({ tracklist: TrackListSlot, player: PlayerSlot, controls: ControlsSlot }),
    [],
  );
  const viewData = useMemo(
    () => ({ tracklist: trackListData, player: playerData, controls: controlsData }),
    [trackListData, playerData, controlsData],
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@400;600&display=swap');
        ::-webkit-scrollbar { width:2px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: ${C.border} }
        button:hover { opacity: 0.75 }
      `}</style>
      <div
        style={{
          width: W,
          height: H,
          background: C.bg,
          overflow: "hidden",
          fontFamily: F,
          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
        }}
      >
        <MachinaReactView layout={layout} views={views} viewData={viewData} />
      </div>
    </>
  );
}
