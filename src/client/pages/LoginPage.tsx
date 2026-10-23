import { useState, type FormEvent } from "react";
import type { User } from "../../shared/types/index.ts";
import { api } from "../lib/api.ts";

export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      onLogin(await api<User>(`/auth/${mode}`, { body: Object.fromEntries(new FormData(e.currentTarget)) }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="auth">
      <form onSubmit={submit} className="auth-form">
        <h1>{mode === "login" ? "Log in" : "Create account"}</h1>
        {mode === "register" && (
          <label>
            Name
            <input name="name" required autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={mode === "register" ? 8 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary">{mode === "login" ? "Log in" : "Sign up"}</button>
        <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "No account? Sign up" : "Have an account? Log in"}
        </button>
      </form>
    </main>
  );
}
