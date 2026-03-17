import React, { useState } from "react";
import { requestJson } from "../api/base";

export default function AuthPanel({ api, onAuth, onToast }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    resetCode: "",
    newPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetCodeIssued, setResetCodeIssued] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  const setModeSafe = (nextMode) => {
    setMode(nextMode);
    setError("");
    setResetMessage("");
    if (nextMode !== "forgot") {
      setResetCodeIssued("");
      setForm((prev) => ({ ...prev, resetCode: "", newPassword: "" }));
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setResetMessage("");

    try {
      if (mode === "forgot") {
        const { data } = await requestJson({
          baseUrl: api?.baseUrl,
          path: "/auth/reset-password",
          method: "POST",
          body: {
            email: form.email.trim(),
            resetCode: form.resetCode.trim(),
            newPassword: form.newPassword,
          },
        });

        if (data?.reset) {
          setResetCodeIssued("");
          setResetMessage("Password updated. You can now log in.");
          setMode("login");
          setForm((prev) => ({
            ...prev,
            password: "",
            resetCode: "",
            newPassword: "",
          }));
        }
      } else {
        const payload =
          mode === "register"
            ? { name: form.name.trim(), email: form.email.trim(), password: form.password }
            : { email: form.email.trim(), password: form.password };

        const { data } = await requestJson({
          baseUrl: api?.baseUrl,
          path: mode === "register" ? "/auth/register" : "/auth/login",
          method: "POST",
          body: payload,
        });

        onAuth(data);
        onToast?.(mode === "register" ? "Account created." : "Logged in.", "success");
      }
    } catch (err) {
      if (err?.status === 401) {
        setError("Email or password is incorrect.");
      } else if (err?.status === 409) {
        setError("This email is already registered.");
      } else if (err?.status === 422) {
        setError(mode === "register" ? "Please enter name, email, and password." : "Please enter a valid email and password.");
      } else if (err?.status === 404) {
        setError("Account not found.");
      } else if (err?.status === 400) {
        setError(err.message || "Reset code is invalid or expired.");
      } else {
        setError(err.message || "Authentication failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const requestResetCode = async () => {
    setSubmitting(true);
    setError("");
    setResetMessage("");
    try {
      const { data } = await requestJson({
        baseUrl: api?.baseUrl,
        path: "/auth/forgot-password",
        method: "POST",
        body: { email: form.email.trim() },
      });
      setResetCodeIssued(String(data?.resetCode || ""));
      setResetMessage(String(data?.message || "If the email exists, a reset code has been generated."));
    } catch (err) {
      setError(err.message || "Could not create reset code.");
    } finally {
      setSubmitting(false);
    }
  };

  const passwordLabel = mode === "forgot" ? "New password" : "Password";
  const passwordValue = mode === "forgot" ? form.newPassword : form.password;
  const passwordVisible = mode === "forgot" ? showNewPassword : showPassword;
  const setPasswordVisible = mode === "forgot" ? setShowNewPassword : setShowPassword;
  const updatePassword = (value) => {
    setForm((prev) => (mode === "forgot" ? { ...prev, newPassword: value } : { ...prev, password: value }));
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
          <button type="button" className={`btn ${mode === "login" ? "active" : ""}`} onClick={() => setModeSafe("login")}>
            Login
          </button>
          <button type="button" className={`btn ${mode === "register" ? "active" : ""}`} onClick={() => setModeSafe("register")}>
            Register
          </button>
          <button type="button" className={`btn ${mode === "forgot" ? "active" : ""}`} onClick={() => setModeSafe("forgot")}>
            Forgot
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
            {passwordLabel}
            <div className="password-row">
              <input
                type={passwordVisible ? "text" : "password"}
                value={passwordValue}
                onChange={(e) => updatePassword(e.target.value)}
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
              <button type="button" className="btn password-toggle" onClick={() => setPasswordVisible((prev) => !prev)}>
                {passwordVisible ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {mode === "forgot" ? (
            <>
              <div className="inline-actions">
                <button type="button" className="btn" onClick={requestResetCode} disabled={submitting || !form.email.trim()}>
                  Get reset code
                </button>
              </div>

              {resetMessage ? <div className="judge-box">{resetMessage}</div> : null}

              {resetCodeIssued ? (
                <div className="judge-box ok">
                  <strong>Reset code</strong>
                  <span className="mono">{resetCodeIssued}</span>
                </div>
              ) : null}

              <label>
                Reset code
                <input
                  value={form.resetCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, resetCode: e.target.value.toUpperCase() }))}
                  placeholder="Paste reset code"
                  required
                />
              </label>
            </>
          ) : null}

          {error ? <div className="inline-error">{error}</div> : null}

          <button type="submit" className="btn primary auth-submit" disabled={submitting}>
            {submitting ? "Please wait..." : mode === "register" ? "Create account" : mode === "forgot" ? "Reset password" : "Login"}
          </button>
        </form>
      </div>
    </section>
  );
}

