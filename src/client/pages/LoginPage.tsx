import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase.ts";

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    // Success is picked up by onAuthStateChange in App.
    const { error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { name: String(form.get("name")).trim() } } });
    if (error) setError(error.message);
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
