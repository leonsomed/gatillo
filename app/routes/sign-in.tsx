import type { FormEvent } from "react";
import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/sign-in";
import { useAuth } from "~/AuthContext";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Sign in - gatillo" },
    { name: "description", content: "Sign in to gatillo" },
  ];
}

export default function SignIn() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    if (!email.trim()) {
      setStatus("Please enter an email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/auth/magiclink", {
        method: "POST",
        body: JSON.stringify({ email }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const text = await response.text();
      if (!response.ok) {
        setStatus(text || "Unable to send magic link.");
        return;
      }

      setStatus(text || "Check your inbox for the magic link.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Unable to send magic link.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="container">
      <h1>Sign in</h1>
      {auth.isLoading ? (
        <p>Checking sign-in status...</p>
      ) : auth.isAuthenticated ? (
        <p>
          You are already signed in
          {auth.user?.email ? ` as ${auth.user.email}` : ""}.
        </p>
      ) : (
        <p>Enter your email to receive a magic link.</p>
      )}
      <form onSubmit={submitMagicLink}>
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={isSubmitting}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send magic link"}
        </button>
      </form>
      {status ? <p>{status}</p> : null}
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </div>
  );
}
