import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
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
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="mb-3 text-3xl font-semibold">Message delivery</h1>
      <p className="text-slate-300">
        This page allows you to decrypt a JSON file that you received via an
        email notification. Upload the file to continue.
      </p>
      <input
        name="claimFile"
        type="file"
        accept="application/json"
        onChange={handleFileChange}
        className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-600"
      />
      {fileName ? (
        <p className="mt-2 text-sm text-slate-400">Loaded file: {fileName}</p>
      ) : null}
      {isLoading ? (
        <p className="mt-2 text-sm text-slate-400">Loading message...</p>
      ) : null}
      {status ? <p className="mt-3 text-red-300">{status}</p> : null}
      {trigger ? (
        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
          {!decrypted ? (
            <>
              <p className="text-slate-300">
                Enter the password to decrypt the message from the author. Below
                is a short note that might have some clues as to what password
                to use.
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
      ) : null}
    </div>
  );
}
