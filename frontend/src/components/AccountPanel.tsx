import { useState } from "react";
import { login, logout, register, type User } from "../auth";
import { useI18n } from "../i18n";

interface AccountPanelProps {
  user: User | null;
  onAuth: (user: User | null) => void;
}

export default function AccountPanel({ user, onAuth }: AccountPanelProps) {
  const { t } = useI18n();
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
        <div className="account-user">{t("signedInAs")} <strong>{user.username}</strong></div>
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
          {t("signOut")}
        </button>
      </div>
    );
  }

  return (
    <div className="account">
      <div className="account-title">{t("saveProgress")}</div>
      <input
        placeholder={t("username")}
        value={username}
        autoComplete="username"
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder={t("passwordPlaceholder")}
        value={password}
        autoComplete="current-password"
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit(login)}
      />
      {error && <div className="account-error">{error}</div>}
      <div className="account-buttons">
        <button className="account-btn" disabled={busy} onClick={() => submit(login)}>
          {t("signIn")}
        </button>
        <button className="account-btn alt" disabled={busy} onClick={() => submit(register)}>
          {t("signUp")}
        </button>
      </div>
    </div>
  );
}
