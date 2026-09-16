import type { Track } from "../api";

interface ActivityBarProps {
  tracks: Track[];
  /** Track ids that actually have lessons authored. */
  liveTracks: Set<string>;
  activeTrack: string;
  view: "workspace" | "transcript";
  onSelectTrack: (id: string) => void;
  onOpenTranscript: () => void;
}

export default function ActivityBar({
  tracks,
  liveTracks,
  activeTrack,
  view,
  onSelectTrack,
  onOpenTranscript,
}: ActivityBarProps) {
  return (
    <nav className="activity-bar">
      <div className="activity-tracks">
        {tracks.map((t) => {
          const live = liveTracks.has(t.id);
          const active = view === "workspace" && activeTrack === t.id;
          return (
            <button
              key={t.id}
              className={`activity-btn${active ? " active" : ""}${live ? "" : " soon"}`}
              style={active ? { color: t.accent, borderColor: t.accent } : undefined}
              onClick={() => onSelectTrack(t.id)}
              title={live ? t.name : `${t.name} — coming soon`}
            >
              <span className="activity-icon">{t.icon}</span>
              {!live && <span className="soon-dot" />}
            </button>
          );
        })}
      </div>
      <button
        className={`activity-btn transcript${view === "transcript" ? " active" : ""}`}
        onClick={onOpenTranscript}
        title="Transcript & badges"
      >
        <span className="activity-icon">🎓</span>
      </button>
    </nav>
  );
}
