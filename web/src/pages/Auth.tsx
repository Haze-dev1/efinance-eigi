import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, setSession, type Session } from "../lib/api";
import { Button, Eyebrow, Header } from "../components/Chrome";

export default function Auth({ mode }: { mode: "signup" | "login" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const path = mode === "signup" ? "/auth/signup" : "/auth/login";
      const res = await api<{ session: Session }>(path, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(res.session);
      // A full reload so the app re-reads the profile from scratch rather than
      // threading the new session through router state.
      window.location.assign("/learn");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not reach the server.",
      );
    } finally {
      setBusy(false);
    }
  }

  const signup = mode === "signup";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-5 py-16">
        <Eyebrow>{signup ? "Create an account" : "Welcome back"}</Eyebrow>
        <h1 className="mt-4 font-display text-[2.1rem] leading-tight font-extrabold">
          {signup
            ? "Six questions, then we know where to start you."
            : "Sign in"}
        </h1>

        <form onSubmit={submit} className="mt-8 grid gap-4">
          <div>
            <label
              htmlFor="email"
              className="font-data text-[0.62rem] uppercase tracking-[0.18em] text-muted"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-rule-soft bg-surface/50 px-4 py-2.5 font-body text-text focus:border-violet"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="font-data text-[0.62rem] uppercase tracking-[0.18em] text-muted"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-rule-soft bg-surface/50 px-4 py-2.5 font-body text-text focus:border-violet"
            />
            {signup && (
              <p className="mt-1.5 font-body text-[0.85rem] text-muted">
                At least 8 characters.
              </p>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose/35 bg-rose-dim px-4 py-3 font-body text-[0.93rem]"
            >
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? "Working…" : signup ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 font-body text-[0.93rem] text-muted">
          {signup ? "Already have an account? " : "New here? "}
          <Link
            to={signup ? "/signin" : "/join"}
            className="text-mint underline underline-offset-2"
          >
            {signup ? "Sign in" : "Create one"}
          </Link>
        </p>
      </main>
    </>
  );
}
