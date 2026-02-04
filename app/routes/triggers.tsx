import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/triggers";
import { useAuth } from "~/AuthContext";
import { decrypt, encrypt } from "~/crypto";

type Trigger = {
  id: string;
  recipients: string;
  label: string;
  subject: string;
  note: string;
  encrypted: string;
  checkinIntervalMs: number;
  triggerMsSinceLastCheckin: number;
  lastIntervalTimestamp: number;
  lastCheckinTimestamp: number;
  lastTriggerTimestamp: number | null;
  triggerSentNotificationCount: number;
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Triggers - gatillo" },
    { name: "description", content: "Manage triggers" },
  ];
}

const INTERVAL_OPTIONS = [
  { value: 1000 * 60 * 60 * 24 * 1, label: "1 day" },
  { value: 1000 * 60 * 60 * 24 * 7, label: "7 days" },
  { value: 1000 * 60 * 60 * 24 * 14, label: "14 days" },
  { value: 1000 * 60 * 60 * 24 * 30, label: "30 days" },
  { value: 1000 * 60 * 60 * 24 * 60, label: "60 days" },
  { value: 1000 * 60 * 60 * 24 * 90, label: "90 days" },
  { value: 1000 * 60 * 60 * 24 * 180, label: "180 days" },
  { value: 1000 * 60 * 60 * 24 * 360, label: "360 days" },
  { value: 1000 * 60 * 60 * 24 * 720, label: "720 days" },
];

type TriggerFormState = {
  recipients: string;
  checkinIntervalMs: string;
  triggerMsSinceLastCheckin: string;
  encrypted: string;
  decrypted: string;
  encryptionPassword: string;
  note: string;
  label: string;
  subject: string;
};

const emptyForm: TriggerFormState = {
  recipients: "",
  checkinIntervalMs: "",
  triggerMsSinceLastCheckin: "",
  encrypted: "",
  decrypted: "",
  encryptionPassword: "",
  note: "",
  label: "",
  subject: "",
};

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTimestamp(value: number | null) {
  if (!value || !Number.isFinite(value)) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return DATE_TIME_FORMAT.format(date);
}

const DURATION_UNITS: Array<[number, string]> = [
  [1000 * 60 * 60 * 24, "day"],
  [1000 * 60 * 60, "hour"],
  [1000 * 60, "minute"],
  [1000, "second"],
];

function formatDurationMs(value: number | null) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return "—";
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  let remaining = Math.round(value);
  const parts: string[] = [];
  for (const [unitMs, label] of DURATION_UNITS) {
    if (remaining < unitMs) {
      continue;
    }
    const count = Math.floor(remaining / unitMs);
    remaining -= count * unitMs;
    parts.push(`${count} ${label}${count === 1 ? "" : "s"}`);
    if (parts.length === 2) {
      break;
    }
  }
  return parts.join(" ");
}

export default function Triggers() {
  const auth = useAuth();
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [revealPassword, setRevealPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<TriggerFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Trigger | null>(null);
  const [deleteStatus, setDeleteStatus] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const formDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement | null>(null);

  const isReady = !auth.isLoading && auth.isAuthenticated;

  const sortedTriggers = useMemo(
    () =>
      [...triggers].sort(
        (a, b) => b.lastCheckinTimestamp - a.lastCheckinTimestamp,
      ),
    [triggers],
  );

  async function loadTriggers() {
    setIsLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/triggers", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to load triggers.");
      }
      const data = (await response.json()) as { triggers?: Trigger[] };
      setTriggers(data.triggers ?? []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isReady) {
      void loadTriggers();
    }
  }, [isReady]);

  useEffect(() => {
    const dialog = formDialogRef.current;
    if (!dialog) {
      return;
    }
    if (isFormOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isFormOpen]);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) {
      return;
    }
    if (isDeleteOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isDeleteOpen]);

  function startNew() {
    setActiveId(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function startEdit(trigger: Trigger) {
    setActiveId(trigger.id);
    setForm({
      recipients: trigger.recipients,
      checkinIntervalMs: String(trigger.checkinIntervalMs),
      triggerMsSinceLastCheckin: String(trigger.triggerMsSinceLastCheckin),
      encrypted: trigger.encrypted,
      decrypted: "",
      encryptionPassword: "",
      note: trigger.note,
      label: trigger.label,
      subject: trigger.subject ?? "",
    });
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setActiveId(null);
    setForm(emptyForm);
  }

  function startDelete(trigger: Trigger) {
    setDeleteTarget(trigger);
    setDeleteStatus("");
    setIsDeleteOpen(true);
  }

  function closeDelete() {
    setIsDeleteOpen(false);
    setDeleteTarget(null);
    setDeleteStatus("");
  }

  async function saveTrigger() {
    setStatus("");

    if (!isReady) {
      setStatus("Sign in to manage triggers.");
      return;
    }

    const checkinIntervalMs = Number(form.checkinIntervalMs);
    const triggerMsSinceLastCheckin = Number(form.triggerMsSinceLastCheckin);

    if (!form.label.trim()) {
      setStatus("Label is required.");
      return;
    }

    if (!form.recipients.trim()) {
      setStatus("Recipients are required.");
      return;
    }
    if (
      !Number.isFinite(checkinIntervalMs) ||
      !checkinIntervalMs ||
      checkinIntervalMs <= 0
    ) {
      setStatus("Select an interval.");
      return;
    }
    if (
      !Number.isFinite(triggerMsSinceLastCheckin) ||
      !triggerMsSinceLastCheckin ||
      triggerMsSinceLastCheckin <= 0
    ) {
      setStatus("Select an interval.");
      return;
    }
    if (!form.note.trim()) {
      setStatus("Note is required.");
      return;
    }

    if (activeId) {
      if (form.encryptionPassword.trim() && !form.decrypted.trim()) {
        setStatus(
          "Unable to decrypt data make sure to enter the right password.",
        );
        return;
      }
    } else {
      if (!form.encryptionPassword.trim()) {
        setStatus("Encryption password is required.");
        return;
      }

      if (!form.decrypted.trim()) {
        setStatus("Encrypted note is required");
        return;
      }
    }

    setIsSaving(true);
    try {
      const extra: { encrypted?: string } = {};
      if (form.encryptionPassword) {
        const block = await encrypt(form.encryptionPassword, form.decrypted);
        extra.encrypted = JSON.stringify(block);
      }
      const response = await fetch(
        activeId ? `/api/triggers/${activeId}` : "/api/triggers",
        {
          method: activeId ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...extra,
            recipients: form.recipients,
            checkinIntervalMs,
            triggerMsSinceLastCheckin,
            note: form.note,
            label: form.label,
            subject: form.subject,
          }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to save trigger.");
      }

      await loadTriggers();
      closeForm();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save.");
    } finally {
      setIsSaving(false);
    }
  }

  async function decryptData() {
    try {
      if (activeId) {
        if (!form.encryptionPassword) {
          setForm((prev) => ({ ...prev, decrypted: "" }));
          return;
        }

        const block = JSON.parse(form.encrypted);
        const text = await decrypt(form.encryptionPassword, block);
        setForm((prev) => ({ ...prev, decrypted: text }));
        setStatus("");
      }
    } catch {
      setForm((prev) => ({ ...prev, decrypted: "" }));
      setStatus("Incorrect password");
    }
  }

  async function copyClaimUrl(triggerId: string) {
    const url = `${window.location.origin}/triggers/claim/${triggerId}`;
    navigator.clipboard.writeText(url);
    alert("Claim URL copied to clipboard");
  }

  function downloadTriggerData(trigger: Trigger) {
    const payload = {
      github: "https://github.com/leonsomed/gatillo",
      note: trigger.note,
      encrypted: JSON.parse(trigger.encrypted),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const filename = `trigger-${trigger.label || trigger.id}.json`;
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function deleteTrigger() {
    if (!deleteTarget) {
      return;
    }

    if (!isReady) {
      setDeleteStatus("Sign in to manage triggers.");
      return;
    }

    setIsDeleting(true);
    setDeleteStatus("");
    try {
      const response = await fetch(`/api/triggers/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to delete trigger.");
      }
      await loadTriggers();
      closeDelete();
    } catch (error) {
      setDeleteStatus(
        error instanceof Error ? error.message : "Unable to delete.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  if (auth.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-12">
        <p className="text-slate-300">Checking sign-in status...</p>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="mb-3 text-3xl font-semibold">Triggers</h1>
        <p className="text-slate-300">Sign in to manage triggers.</p>
        <p>
          <Link to="/sign-in" className="text-blue-300 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-4 flex items-center justify-between gap-4 text-2xl font-semibold">
          Triggers{" "}
          <button
            type="button"
            onClick={startNew}
            disabled={isSaving || isDeleting}
            className="cursor-pointer inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            New trigger
          </button>
        </h2>
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading triggers...</p>
        ) : null}
        {!isLoading && sortedTriggers.length === 0 ? (
          <p className="text-slate-300">No triggers yet.</p>
        ) : null}
        {sortedTriggers.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-200">
              <thead className="bg-slate-950 text-slate-200">
                <tr>
                  <th className="border border-slate-800 px-3 py-2">Label</th>
                  <th className="border border-slate-800 px-3 py-2">
                    Check-in interval
                  </th>
                  <th className="border border-slate-800 px-3 py-2">
                    Check-in trigger threshold
                  </th>
                  <th className="border border-slate-800 px-3 py-2">
                    Last check-in sent
                  </th>
                  <th className="border border-slate-800 px-3 py-2">
                    Last check-in received
                  </th>
                  <th className="border border-slate-800 px-3 py-2">
                    Last trigger
                  </th>
                  <th className="border border-slate-800 px-3 py-2">
                    Trigger notifications
                  </th>
                  <th className="border border-slate-800 px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTriggers.map((trigger) => (
                  <tr
                    key={trigger.id}
                    className="odd:bg-slate-900 even:bg-slate-950/80"
                  >
                    <td className="border border-slate-800 px-3 py-2">
                      {trigger.label}
                    </td>
                    <td className="border border-slate-800 px-3 py-2">
                      {formatDurationMs(trigger.checkinIntervalMs)}
                    </td>
                    <td className="border border-slate-800 px-3 py-2">
                      {formatDurationMs(trigger.triggerMsSinceLastCheckin)}
                    </td>
                    <td className="border border-slate-800 px-3 py-2">
                      {formatTimestamp(trigger.lastIntervalTimestamp)}
                    </td>
                    <td className="border border-slate-800 px-3 py-2">
                      {formatTimestamp(trigger.lastCheckinTimestamp)}
                    </td>
                    <td className="border border-slate-800 px-3 py-2">
                      {formatTimestamp(trigger.lastTriggerTimestamp)}
                    </td>
                    <td className="border border-slate-800 px-3 py-2">
                      {trigger.triggerSentNotificationCount || "—"}
                    </td>
                    <td className="border border-slate-800 px-3 py-2">
                      <div className="flex flex-nowrap gap-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => void copyClaimUrl(trigger.id)}
                          className="cursor-pointer inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                        >
                          Claim URL
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadTriggerData(trigger)}
                          className="cursor-pointer inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving || isDeleting}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(trigger)}
                          disabled={isSaving || isDeleting}
                          className="cursor-pointer inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => startDelete(trigger)}
                          disabled={isSaving || isDeleting}
                          className="cursor-pointer inline-flex items-center justify-center rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {isFormOpen ? (
        <dialog
          ref={formDialogRef}
          onCancel={(event) => {
            event.preventDefault();
            closeForm();
          }}
          className="fixed inset-0 m-auto h-fit w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-0 text-slate-200 backdrop:bg-slate-900/95"
        >
          <article className="rounded-xl bg-slate-900 p-4">
            <header className="mb-4">
              <h2 className="text-2xl font-semibold">
                {activeId ? "Edit trigger" : "Add trigger"}
              </h2>
            </header>
            <form className="space-y-3">
              <div
                role="alert"
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200"
              >
                Alert: Recipient email addresses must be verified in AWS SES
                before they can receive trigger notifications.
              </div>
              <label className="block text-sm font-semibold text-slate-200">
                Label
                <input
                  name="label"
                  placeholder="Some label"
                  value={form.label}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      label: event.target.value,
                    }))
                  }
                  required
                  disabled={isSaving}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-200">
                Subject (optional)
                <input
                  name="subject"
                  placeholder="Email subject for trigger notifications"
                  value={form.subject}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      subject: event.target.value,
                    }))
                  }
                  disabled={isSaving}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-200">
                Recipients (comma-separated emails)
                <input
                  name="recipients"
                  placeholder="alice@example.com, bob@example.com"
                  value={form.recipients}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      recipients: event.target.value,
                    }))
                  }
                  required
                  disabled={isSaving}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-200">
                Time between check-ins
                <select
                  name="checkinIntervalMs"
                  value={form.checkinIntervalMs}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      checkinIntervalMs: event.target.value,
                    }))
                  }
                  required
                  disabled={isSaving}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  <option value="" disabled>
                    Select interval
                  </option>
                  {INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-200">
                Time allowed since last check-in
                <select
                  name="triggerMsSinceLastCheckin"
                  value={form.triggerMsSinceLastCheckin}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      triggerMsSinceLastCheckin: event.target.value,
                    }))
                  }
                  required
                  disabled={isSaving}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                >
                  <option value="" disabled>
                    Select interval
                  </option>
                  {INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-200">
                Note
                <textarea
                  name="note"
                  rows={3}
                  value={form.note}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  required
                  disabled={isSaving}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-200">
                Encryption password
                <input
                  name="encryptionPassword"
                  type={revealPassword ? "text" : "password"}
                  value={form.encryptionPassword}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      encryptionPassword: event.target.value,
                    }))
                  }
                  onBlur={() => {
                    decryptData();
                  }}
                  required
                  disabled={isSaving}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <label className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-300">
                  <input
                    type="checkbox"
                    checked={revealPassword}
                    onChange={(event) =>
                      setRevealPassword(event.target.checked)
                    }
                    disabled={isSaving}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-500"
                  />
                  Show password
                </label>
              </label>
              <label className="block text-sm font-semibold text-slate-200">
                Encrypted Note
                <textarea
                  name="decrypted"
                  rows={3}
                  value={form.decrypted}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      decrypted: event.target.value,
                    }))
                  }
                  required
                  disabled={isSaving || Boolean(activeId && !form.decrypted)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </label>
              {status ? <p className="text-sm text-red-300">{status}</p> : null}
            </form>
            <footer className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeForm}
                disabled={isSaving}
                className="cursor-pointer inline-flex items-center justify-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveTrigger}
                disabled={isSaving}
                className="cursor-pointer inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving
                  ? "Saving..."
                  : activeId
                    ? "Save trigger"
                    : "Create trigger"}
              </button>
            </footer>
          </article>
        </dialog>
      ) : null}
      {isDeleteOpen && deleteTarget ? (
        <dialog
          ref={deleteDialogRef}
          onCancel={(event) => {
            event.preventDefault();
            closeDelete();
          }}
          className="fixed inset-0 m-auto h-fit w-full max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-0 text-slate-200 backdrop:bg-slate-900/95"
        >
          <article className="rounded-xl bg-slate-900 p-4">
            <header className="mb-4">
              <h2 className="text-2xl font-semibold">Delete trigger</h2>
            </header>
            <p className="text-slate-300">
              Are you sure you want to delete{" "}
              <strong>{deleteTarget.label}</strong>? This cannot be undone.
            </p>
            {deleteStatus ? (
              <p className="mt-3 text-sm text-red-300">{deleteStatus}</p>
            ) : null}
            <footer className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeDelete}
                disabled={isDeleting}
                className="cursor-pointer inline-flex items-center justify-center rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteTrigger}
                disabled={isDeleting}
                className="cursor-pointer inline-flex items-center justify-center rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete trigger"}
              </button>
            </footer>
          </article>
        </dialog>
      ) : null}
    </div>
  );
}
