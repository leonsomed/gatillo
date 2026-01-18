import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
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
    <div className="container">
      <h1>Message delivery</h1>
      {isLoading ? <p>Loading message...</p> : null}
      {status ? <p style={{ color: "red" }}>{status}</p> : null}
      {trigger ? (
        <>
          <section>
            {!decrypted ? (
              <>
                <p>
                  Enter the password to decrypt the message from the author.
                  Below is a short note that might have some clues as to what
                  password to use.
                </p>

                <form onSubmit={handleDecrypt}>
                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                  <label>
                    Note
                    <textarea readOnly rows={6} value={trigger.note} />
                  </label>
                  <button type="submit">Decrypt</button>
                </form>
              </>
            ) : (
              <>
                <label>
                  Note
                  <textarea readOnly rows={6} value={trigger.note} />
                </label>
                <label>
                  Decrypted data
                  <textarea readOnly rows={6} value={decrypted} />
                </label>
              </>
            )}
          </section>
        </>
      ) : null}
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </div>
  );
}
