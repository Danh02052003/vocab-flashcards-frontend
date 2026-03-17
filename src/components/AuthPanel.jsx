import React, { useState } from "react";

export default function AuthPanel({ api, onAuth, onToast }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const payload =
        mode === "register"
          ? { name: form.name.trim(), email: form.email.trim(), password: form.password }
          : { email: form.email.trim(), password: form.password };
      const data = mode === "register" ? await api.authRegister(payload) : await api.authLogin(payload);
      onAuth(data);
      onToast?.(mode === "register" ? "Account created." : "Logged in.", "success");
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <span className="eyebrow">Simple account</span>
          <h1>Login or create an account</h1>
          <p>Your vocabulary, reviews, packs, and writing data will be separated by account.</p>
        </div>

        <div className="auth-tabs">
          <button type="button" className={`btn ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>
            Login
          </button>
          <button type="button" className={`btn ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "register" ? (
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Your name"
                required
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="you@example.com"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="At least 6 characters"
              minLength={6}
              required
            />
          </label>

          {error ? <div className="inline-error">{error}</div> : null}

          <button type="submit" className="btn primary auth-submit" disabled={submitting}>
            {submitting ? "Please wait..." : mode === "register" ? "Create account" : "Login"}
          </button>
        </form>
      </div>
    </section>
  );
}

