import { useState } from "react";
import type { Lesson, Phase, Track, Attribution } from "../api";
import type { User } from "../auth";
import { useI18n } from "../i18n";

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
  const { locale, t } = useI18n();
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
  const today = new Date().toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="transcript">
      <div className="transcript-head">
        <h2>🎓 {t("transcript")}</h2>
        <p className="transcript-sub">
          {user ? (
            t("signedInProgress", { user: user.username, done: totalDone, total: totalLessons })
          ) : (
            t("signInProgress", { done: totalDone, total: totalLessons })
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
                    {t("lessonCount", { done: s.done, total: s.total })}
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
                        {s.done === 0 ? t("startTrack") : t("continueTrack")}
                      </button>
                    )}
                    {complete && (
                      <button className="track-cert" onClick={() => setCertTrack(s.track)}>
                        🏅 {t("certificate")}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="track-soon">{t("comingSoon")}</div>
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
                <div className="cert-brand">SYNAPSIS ACADEMY</div>
                <div className="cert-title">{t("certificateTitle")}</div>
                <div className="cert-presented">{t("certPresented")}</div>
                <div className="cert-name">{user?.username ?? t("learner")}</div>
                <div className="cert-presented">{t("certCompletedTrack")}</div>
                <div className="cert-track" style={{ color: certTrack.accent }}>
                  {certTrack.icon} {certTrack.name}
                </div>
                <div className="cert-date">{today}</div>
                <div className="cert-foot">
                  <div>
                    <div className="cert-sig">SynerGro.Ai Corp</div>
                    <div className="cert-sig-label">{t("sponsor")}</div>
                  </div>
                  <div>
                    <div className="cert-sig">{credit.author}</div>
                    <div className="cert-sig-label">{t("curriculumCredit")}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="cert-buttons">
              <button className="track-open" onClick={() => window.print()}>
                {t("printSavePdf")}
              </button>
              <button className="track-cert" onClick={() => setCertTrack(null)}>
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
