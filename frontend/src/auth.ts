export interface User {
  username: string;
}

export interface LessonProgress {
  lessonId: number;
  completed: boolean;
  sketch: string | null;
}

export interface ProgressData {
  currentLesson: number;
  lessons: LessonProgress[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // no JSON body — keep the generic message
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const register = (username: string, password: string) =>
  request<User>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const login = (username: string, password: string) =>
  request<User>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const logout = () =>
  request<void>("/api/auth/logout", { method: "POST" });

export async function me(): Promise<User | null> {
  try {
    const res = await fetch("/api/auth/me");
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

export const getProgress = () => request<ProgressData>("/api/progress");

export const saveProgress = (
  lessonId: number,
  body: { completed: boolean; sketch: string; current: boolean },
) =>
  request<void>(`/api/progress/${lessonId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
