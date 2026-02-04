import type { FormEvent } from "react";
import { useState } from "react";
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
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="mb-3 text-3xl font-semibold">Sign in</h1>
      {auth.isLoading ? (
        <p className="text-slate-300">Checking sign-in status...</p>
      ) : auth.isAuthenticated ? (
        <p className="text-slate-300">
          You are already signed in
          {auth.user?.email ? ` as ${auth.user.email}` : ""}.
        </p>
      ) : (
        <p className="text-slate-300">
          Enter your email to receive a magic link.
        </p>
      )}
      <form onSubmit={submitMagicLink} className="mt-4 space-y-3">
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={isSubmitting}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="cursor-pointer inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Sending..." : "Send magic link"}
        </button>
      </form>
      {status ? <p className="mt-3 text-red-300">{status}</p> : null}
    </div>
  );
}
