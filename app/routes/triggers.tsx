import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/triggers";
import { useAuth } from "~/AuthContext";
import { decrypt, encrypt } from "~/crypto";

type Trigger = {
  id: string;
  recipients: string;
  label: string;
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
      <div>
        <p>Checking sign-in status...</p>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div>
        <h1>Triggers</h1>
        <p>Sign in to manage triggers.</p>
        <p>
          <Link to="/sign-in">Sign in</Link>
        </p>
        <p>
          <Link to="/">Back to home</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="container">
      <section>
        <h2
          style={{
            margin: "20px",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          Triggers{" "}
          <button
            type="button"
            onClick={startNew}
            disabled={isSaving || isDeleting}
          >
            New trigger
          </button>
        </h2>
        {isLoading ? <p>Loading triggers...</p> : null}
        {!isLoading && sortedTriggers.length === 0 ? (
          <p>No triggers yet.</p>
        ) : null}
        {sortedTriggers.length ? (
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Check-in interval</th>
                <th>Check-in trigger threshold</th>
                <th>Last check-in sent</th>
                <th>Last check-in received</th>
                <th>Last trigger</th>
                <th>Trigger notifications</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTriggers.map((trigger) => (
                <tr key={trigger.id}>
                  <td>{trigger.label}</td>
                  <td>{formatDurationMs(trigger.checkinIntervalMs)}</td>
                  <td>{formatDurationMs(trigger.triggerMsSinceLastCheckin)}</td>
                  <td>{formatTimestamp(trigger.lastIntervalTimestamp)}</td>
                  <td>{formatTimestamp(trigger.lastCheckinTimestamp)}</td>
                  <td>{formatTimestamp(trigger.lastTriggerTimestamp)}</td>
                  <td>{trigger.triggerSentNotificationCount || "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() => void copyClaimUrl(trigger.id)}
                        className="outline secondary"
                        style={{ textWrap: "nowrap" }}
                      >
                        Claim URL
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTriggerData(trigger)}
                        className="outline"
                        style={{ textWrap: "nowrap" }}
                        disabled={isSaving || isDeleting}
                      >
                        Download JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(trigger)}
                        disabled={isSaving || isDeleting}
                        style={{ textWrap: "nowrap" }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => startDelete(trigger)}
                        disabled={isSaving || isDeleting}
                        className="secondary"
                        style={{ textWrap: "nowrap" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
      {isFormOpen ? (
        <dialog
          open
          onCancel={(event) => {
            event.preventDefault();
            closeForm();
          }}
        >
          <article>
            <header>
              <h2>{activeId ? "Edit trigger" : "Add trigger"}</h2>
            </header>
            <form>
              <label>
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
                />
              </label>
              <label>
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
                />
              </label>
              <label>
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
              <label>
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
              <label>
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
                />
              </label>
              <label>
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
                />
                <label>
                  <input
                    type="checkbox"
                    checked={revealPassword}
                    onChange={(event) =>
                      setRevealPassword(event.target.checked)
                    }
                    disabled={isSaving}
                  />
                  Show password
                </label>
              </label>
              <label>
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
                />
              </label>
              {status ? <p style={{ color: "red" }}>{status}</p> : null}
            </form>
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={closeForm}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button type="button" onClick={saveTrigger} disabled={isSaving}>
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
          open
          onCancel={(event) => {
            event.preventDefault();
            closeDelete();
          }}
        >
          <article>
            <header>
              <h2>Delete trigger</h2>
            </header>
            <p>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget.label}</strong>? This cannot be undone.
            </p>
            {deleteStatus ? (
              <p style={{ color: "red" }}>{deleteStatus}</p>
            ) : null}
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={closeDelete}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteTrigger}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete trigger"}
              </button>
            </footer>
          </article>
        </dialog>
      ) : null}
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </div>
  );
}
