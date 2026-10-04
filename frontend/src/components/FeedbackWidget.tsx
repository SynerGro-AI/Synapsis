import { useState } from "react";
import { submitFeedback } from "../feedback";

interface FeedbackWidgetProps {
  /** Short, non-personal note about what the visitor is looking at (e.g. the track). */
  context?: string;
}

type Status = "idle" | "sending" | "sent" | "error";

const STAR_LABELS = ["Poor", "Fair", "Good", "Great", "Excellent"];

export default function FeedbackWidget({ context }: FeedbackWidgetProps) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  function resetForm() {
    setRating(0);
    setHover(0);
    setComment("");
    setStatus("idle");
    setError("");
  }

  function close() {
    setOpen(false);
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (rating < 1) {
      setStatus("error");
      setError("Please choose a star rating first.");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      await submitFeedback({
        rating,
        comment: comment.trim() || undefined,
        context,
      });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not send feedback.");
    }
  }

  const shown = hover || rating;

  return (
    <div className="feedback-widget">
      {open && (
        <div
          className="feedback-card"
          role="dialog"
          aria-label="Share your feedback"
        >
          <div className="feedback-card-head">
            <strong>Share your feedback</strong>
            <button
              type="button"
              className="feedback-close"
              onClick={close}
              aria-label="Close feedback"
            >
              ✕
            </button>
          </div>

          {status === "sent" ? (
            <div className="feedback-thanks" role="status">
              <p>Thank you! Your feedback helps shape Synapsis.</p>
              <button
                type="button"
                className="feedback-secondary"
                onClick={resetForm}
              >
                Send another
              </button>
            </div>
          ) : (
            <form className="feedback-form" onSubmit={send}>
              <div
                className="feedback-stars"
                role="radiogroup"
                aria-label="Star rating"
                onMouseLeave={() => setHover(0)}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={`feedback-star${value <= shown ? " on" : ""}`}
                    role="radio"
                    aria-checked={rating === value}
                    aria-label={`${value} star${value === 1 ? "" : "s"} — ${STAR_LABELS[value - 1]}`}
                    onMouseEnter={() => setHover(value)}
                    onFocus={() => setHover(value)}
                    onBlur={() => setHover(0)}
                    onClick={() => {
                      setRating(value);
                      if (status === "error") {
                        setStatus("idle");
                        setError("");
                      }
                    }}
                  >
                    ★
                  </button>
                ))}
                <span className="feedback-star-label" aria-hidden="true">
                  {shown ? STAR_LABELS[shown - 1] : "Tap a star"}
                </span>
              </div>

              <label className="feedback-comment-label" htmlFor="feedback-comment">
                Comment <span>(optional)</span>
              </label>
              <textarea
                id="feedback-comment"
                className="feedback-comment"
                rows={3}
                maxLength={1000}
                placeholder="What did you like, or what could be better?"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />

              {error && (
                <p className="feedback-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="feedback-submit"
                disabled={status === "sending"}
              >
                {status === "sending" ? "Sending…" : "Send feedback"}
              </button>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        className={`feedback-fab${open ? " active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Hide feedback form" : "Give feedback"}
      >
        <span aria-hidden="true">★</span>
        <span className="feedback-fab-text">Feedback</span>
      </button>
    </div>
  );
}
