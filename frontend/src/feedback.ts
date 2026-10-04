export interface FeedbackInput {
  rating: number;
  comment?: string;
  context?: string;
}

/** Send a star rating (and optional comment) to the backend. Works for signed-in
 *  and anonymous visitors; the server attaches the username only when present. */
export async function submitFeedback(input: FeedbackInput): Promise<void> {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let message = `Could not send feedback (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // no JSON body — keep the generic message
    }
    throw new Error(message);
  }
}
