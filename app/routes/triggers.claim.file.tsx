import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/triggers.claim.file";
import type { EncryptedBlock } from "~/crypto";
import { decrypt } from "~/crypto";

type ClaimTrigger = {
  note: string;
  encryptedBlock: EncryptedBlock;
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Claim message file - gatillo" },
    { name: "description", content: "Claim trigger details from a file" },
  ];
}

function parseClaimFile(contents: string): ClaimTrigger {
  let data: unknown;
  try {
    data = JSON.parse(contents);
  } catch {
    throw new Error("Invalid JSON file.");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Invalid message data.");
  }

  const note = (data as { note?: unknown }).note;
  if (typeof note !== "string" || !note.trim()) {
    throw new Error("Missing note in file.");
  }

  const encryptedRaw = (data as { encrypted?: unknown }).encrypted;
  if (!encryptedRaw) {
    throw new Error("Missing encrypted block in file.");
  }

  let encryptedBlock: EncryptedBlock;
  if (typeof encryptedRaw === "string") {
    try {
      encryptedBlock = JSON.parse(encryptedRaw) as EncryptedBlock;
    } catch {
      throw new Error("Encrypted block is not valid JSON.");
    }
  } else {
    encryptedBlock = encryptedRaw as EncryptedBlock;
  }

  if (
    !encryptedBlock ||
    typeof encryptedBlock !== "object" ||
    typeof encryptedBlock.salt !== "string" ||
    typeof encryptedBlock.iv !== "string" ||
    typeof encryptedBlock.data !== "string" ||
    typeof encryptedBlock.version !== "number"
  ) {
    throw new Error("Encrypted block is missing required fields.");
  }

  return { note, encryptedBlock };
}

export default function ClaimFilePage() {
  const [trigger, setTrigger] = useState<ClaimTrigger | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [password, setPassword] = useState("");
  const [decrypted, setDecrypted] = useState("");
  const [fileName, setFileName] = useState("");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setStatus("");
    setDecrypted("");
    setPassword("");

    if (!file) {
      setTrigger(null);
      setFileName("");
      return;
    }

    setIsLoading(true);
    try {
      const contents = await file.text();
      const parsed = parseClaimFile(contents);
      setTrigger(parsed);
      setFileName(file.name);
    } catch (error) {
      setTrigger(null);
      setFileName("");
      setStatus(
        error instanceof Error ? error.message : "Unable to read file.",
      );
    } finally {
      setIsLoading(false);
    }
  }

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
      const text = await decrypt(password, trigger.encryptedBlock);
      setDecrypted(text);
    } catch {
      setStatus("Incorrect password or unable to decrypt.");
    }
  }

  return (
    <div className="container">
      <h1>Message delivery</h1>
      <p>
        This page allows you to decrypt a JSON file that you received via an
        email notification. Upload the file to continue.
      </p>
      <input
        name="claimFile"
        type="file"
        accept="application/json"
        onChange={handleFileChange}
      />
      {fileName ? <p>Loaded file: {fileName}</p> : null}
      {isLoading ? <p>Loading message...</p> : null}
      {status ? <p style={{ color: "red" }}>{status}</p> : null}
      {trigger ? (
        <section>
          {!decrypted ? (
            <>
              <p>
                Enter the password to decrypt the message from the author. Below
                is a short note that might have some clues as to what password
                to use.
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
      ) : null}
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </div>
  );
}
