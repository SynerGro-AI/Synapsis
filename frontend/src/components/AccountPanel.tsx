import { useState } from "react";
import { login, logout, register, type User } from "../auth";

interface AccountPanelProps {
  user: User | null;
  onAuth: (user: User | null) => void;
}

export default function AccountPanel({ user, onAuth }: AccountPanelProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(action: typeof login) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      onAuth(await action(username, password));
      setUsername("");
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return (
      <div className="account">
        <div className="account-user">Signed in as <strong>{user.username}</strong></div>
        <button
          className="account-btn"
          onClick={async () => {
            try {
              await logout();
            } finally {
              onAuth(null);
            }
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="account">
      <div className="account-title">Save your progress</div>
      <input
        placeholder="username"
        value={username}
        autoComplete="username"
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="password (8+ chars)"
        value={password}
        autoComplete="current-password"
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit(login)}
      />
      {error && <div className="account-error">{error}</div>}
      <div className="account-buttons">
        <button className="account-btn" disabled={busy} onClick={() => submit(login)}>
          Sign in
        </button>
        <button className="account-btn alt" disabled={busy} onClick={() => submit(register)}>
          Sign up
        </button>
      </div>
    </div>
  );
}
