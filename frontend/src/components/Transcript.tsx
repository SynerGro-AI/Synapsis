import { useState } from "react";
import type { Lesson, Phase, Track, Attribution } from "../api";
import type { User } from "../auth";

interface TranscriptProps {
  tracks: Track[];
  phases: Phase[];
  lessons: Lesson[];
  completedIds: Set<number>;
  user: User | null;
  credit: Attribution;
  onOpenLesson: (trackId: string, lessonId: number) => void;
}

interface TrackStat {
  track: Track;
  total: number;
  done: number;
  pct: number;
  phases: {
    phase: Phase;
    total: number;
    done: number;
    earned: boolean;
  }[];
  firstLesson: number | null;
}

export default function Transcript({
  tracks,
  phases,
  lessons,
  completedIds,
  user,
  credit,
  onOpenLesson,
}: TranscriptProps) {
  const [certTrack, setCertTrack] = useState<Track | null>(null);

  const stats: TrackStat[] = tracks.map((track) => {
    const trackPhases = phases.filter((p) => p.track === track.id);
    const trackLessons = lessons.filter((l) =>
      trackPhases.some((p) => p.id === l.phase),
    );
    const done = trackLessons.filter((l) => completedIds.has(l.id)).length;
    const total = trackLessons.length;
    return {
      track,
      total,
      done,
      pct: total ? Math.round((done / total) * 100) : 0,
      firstLesson: trackLessons[0]?.id ?? null,
      phases: trackPhases
        .filter((p) => trackLessons.some((l) => l.phase === p.id))
        .map((phase) => {
          const inPhase = trackLessons.filter((l) => l.phase === phase.id);
          const phaseDone = inPhase.filter((l) => completedIds.has(l.id)).length;
          return {
            phase,
            total: inPhase.length,
            done: phaseDone,
            earned: inPhase.length > 0 && phaseDone === inPhase.length,
          };
        }),
    };
  });

  const totalDone = stats.reduce((n, s) => n + s.done, 0);
  const totalLessons = stats.reduce((n, s) => n + s.total, 0);
  const today = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="transcript">
      <div className="transcript-head">
        <h2>🎓 Transcript</h2>
        <p className="transcript-sub">
          {user ? (
            <>
              Signed in as <strong>{user.username}</strong> · {totalDone}/
              {totalLessons} lessons complete across all tracks
            </>
          ) : (
            <>Sign in to save badges and earn certificates · {totalDone}/{totalLessons} complete</>
          )}
        </p>
      </div>

      <div className="transcript-grid">
        {stats.map((s) => {
          const live = s.total > 0;
          const complete = live && s.done === s.total;
          return (
            <div
              key={s.track.id}
              className={`track-card${live ? "" : " soon"}`}
              style={{ borderTopColor: s.track.accent }}
            >
              <div className="track-card-head">
                <span className="track-card-icon" style={{ color: s.track.accent }}>
                  {s.track.icon}
                </span>
                <div>
                  <h3>{s.track.name}</h3>
                  <p className="track-blurb">{s.track.blurb}</p>
                </div>
              </div>

              {live ? (
                <>
                  <div className="progress-row">
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${s.pct}%`, background: s.track.accent }}
                      />
                    </div>
                    <span className="progress-pct">{s.pct}%</span>
                  </div>
                  <div className="track-count">
                    {s.done} / {s.total} lessons
                  </div>

                  <div className="badge-row">
                    {s.phases.map((p) => (
                      <span
                        key={p.phase.id}
                        className={`badge${p.earned ? " earned" : ""}`}
                        title={`${p.done}/${p.total} in ${p.phase.name}`}
                      >
                        {p.earned ? "★" : "☆"} {p.phase.name}
                      </span>
                    ))}
                  </div>

                  <div className="track-actions">
                    {s.firstLesson !== null && (
                      <button
                        className="track-open"
                        onClick={() => onOpenLesson(s.track.id, s.firstLesson!)}
                      >
                        {s.done === 0 ? "Start track" : "Continue"}
                      </button>
                    )}
                    {complete && (
                      <button className="track-cert" onClick={() => setCertTrack(s.track)}>
                        🏅 Certificate
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="track-soon">Coming soon</div>
              )}
            </div>
          );
        })}
      </div>

      {certTrack && (
        <div className="cert-overlay" onClick={() => setCertTrack(null)}>
          <div className="cert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="certificate-sheet">
              <div className="cert-border">
                <div className="cert-brand">SYNAPSYS ACADEMY</div>
                <div className="cert-title">Certificate of Completion</div>
                <div className="cert-presented">This certifies that</div>
                <div className="cert-name">{user?.username ?? "Learner"}</div>
                <div className="cert-presented">has successfully completed the track</div>
                <div className="cert-track" style={{ color: certTrack.accent }}>
                  {certTrack.icon} {certTrack.name}
                </div>
                <div className="cert-date">{today}</div>
                <div className="cert-foot">
                  <div>
                    <div className="cert-sig">SynerGro.Ai Corp</div>
                    <div className="cert-sig-label">Sponsor</div>
                  </div>
                  <div>
                    <div className="cert-sig">{credit.author}</div>
                    <div className="cert-sig-label">Curriculum · toptechboy.com</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="cert-buttons">
              <button className="track-open" onClick={() => window.print()}>
                🖨 Print / Save as PDF
              </button>
              <button className="track-cert" onClick={() => setCertTrack(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
