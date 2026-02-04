import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { Route } from "./+types/triggers.claim.$triggerId";
import { decrypt } from "~/crypto";

type ClaimTrigger = {
  note: string;
  encrypted: string;
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Claim trigger - gatillo" },
    { name: "description", content: "Claim trigger details" },
  ];
}

export default function ClaimTriggerPage({ params }: Route.ComponentProps) {
  const { triggerId } = params;
  const [trigger, setTrigger] = useState<ClaimTrigger | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [password, setPassword] = useState("");
  const [decrypted, setDecrypted] = useState("");

  useEffect(() => {
    if (!triggerId) {
      setStatus("Missing message id.");
      return;
    }

    let isActive = true;
    async function loadTrigger() {
      setIsLoading(true);
      setStatus("");
      try {
        const response = await fetch(`/api/triggers/claim/${triggerId}`, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("This message is not available yet.");
          }
          const text = await response.text();
          throw new Error(text || "Unable to load message.");
        }
        const data = (await response.json()) as { trigger?: ClaimTrigger };
        if (!isActive) {
          return;
        }
        setTrigger(data.trigger ?? null);
        if (!data.trigger) {
          setStatus("This message is not available yet.");
        }
      } catch (error) {
        if (!isActive) {
          return;
        }
        setStatus(error instanceof Error ? error.message : "Unable to load.");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadTrigger();
    return () => {
      isActive = false;
    };
  }, [triggerId]);

  async function handleDecrypt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setDecrypted("");

    if (!trigger) {
      setStatus("Message data is not available.");
      return;
    }
    if (!password.trim()) {
      setStatus("Enter the password to decrypt.");
      return;
    }

    try {
      const block = JSON.parse(trigger.encrypted);
      const text = await decrypt(password, block);
      setDecrypted(text);
    } catch {
      setStatus("Incorrect password or unable to decrypt.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="mb-3 text-3xl font-semibold">Message delivery</h1>
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading message...</p>
      ) : null}
      {status ? <p className="mt-3 text-red-300">{status}</p> : null}
      {trigger ? (
        <>
          <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
            {!decrypted ? (
              <>
                <p className="text-slate-300">
                  Enter the password to decrypt the message from the author.
                  Below is a short note that might have some clues as to what
                  password to use.
                </p>

                <form onSubmit={handleDecrypt} className="mt-4 space-y-3">
                  <label className="block text-sm font-semibold text-slate-200">
                    Password
                    <input
                      name="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-slate-200">
                    Note
                    <textarea
                      readOnly
                      rows={6}
                      value={trigger.note}
                      className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                    />
                  </label>
                  <button
                    type="submit"
                    className="cursor-pointer inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                  >
                    Decrypt
                  </button>
                </form>
              </>
            ) : (
              <>
                <label className="block text-sm font-semibold text-slate-200">
                  Note
                  <textarea
                    readOnly
                    rows={6}
                    value={trigger.note}
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  />
                </label>
                <label className="mt-4 block text-sm font-semibold text-slate-200">
                  Decrypted data
                  <textarea
                    readOnly
                    rows={6}
                    value={decrypted}
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  />
                </label>
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
