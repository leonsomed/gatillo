import { randomUUID } from "node:crypto";
import express from "express";
import { asyncHandler, requireAuth } from "./auth";
import { useDb } from "./db";
import { InvalidRequestError } from "./errors";
import { uploadCheckinTimestampToS3 } from "./s3";
import type { AppUser } from "./users";

export type Trigger = {
  id: string;
  userId: string;
  recipients: string;
  note: string;
  label: string;
  encrypted: string;
  checkinIntervalMs: number;
  lastIntervalTimestamp: number;
  lastCheckinTimestamp: number;
  lastTriggerTimestamp: number | null;
  triggerMsSinceLastCheckin: number;
  triggerSentNotificationCount: number;
};

type TriggerInput = {
  recipients: string;
  note: string;
  label: string;
  encrypted: string;
  checkinIntervalMs: number;
  triggerMsSinceLastCheckin: number;
};

type CheckinToken = {
  id: string;
  triggerId: string;
  expiresAt: number;
};

export const TRIGGER_THRESHOLD_NOTIFICATION_INTERVAL = 1000 * 60 * 60 * 24 * 7;

function requireUser(req: express.Request): AppUser {
  const user = req.user as AppUser | undefined;
  if (!user?.id) {
    throw new InvalidRequestError();
  }
  return user;
}

function isTriggerClaimable(trigger: Trigger, now: number) {
  return (
    now - trigger.lastCheckinTimestamp >= trigger.triggerMsSinceLastCheckin
  );
}

function parseTriggerInput(
  body: unknown,
  operationType: "create" | "update",
): TriggerInput {
  if (typeof body !== "object" || body === null) {
    throw new InvalidRequestError();
  }
  const input = body as Record<string, unknown>;
  const recipients =
    typeof input.recipients === "string" ? input.recipients.trim() : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const encrypted =
    typeof input.encrypted === "string" ? input.encrypted.trim() : "";
  const checkinIntervalMs =
    typeof input.checkinIntervalMs === "number"
      ? input.checkinIntervalMs
      : Number(input.checkinIntervalMs);
  const triggerMsSinceLastCheckin =
    typeof input.triggerMsSinceLastCheckin === "number"
      ? input.triggerMsSinceLastCheckin
      : Number(input.triggerMsSinceLastCheckin);

  if (
    !recipients ||
    !note ||
    !label ||
    (operationType === "create" && !encrypted) ||
    !Number.isFinite(checkinIntervalMs) ||
    !Number.isFinite(triggerMsSinceLastCheckin)
  ) {
    throw new InvalidRequestError();
  }

  return {
    recipients,
    note,
    label,
    encrypted,
    checkinIntervalMs,
    triggerMsSinceLastCheckin,
  };
}

async function getTriggersByUserId(userId: string): Promise<Trigger[]> {
  return await useDb(async (db) => {
    const op = db.prepare(
      `SELECT id, userId, recipients, note, label, encrypted, checkinIntervalMs, lastIntervalTimestamp, lastCheckinTimestamp, triggerMsSinceLastCheckin, lastTriggerTimestamp, triggerSentNotificationCount
      FROM triggers WHERE userId = ? ORDER BY lastCheckinTimestamp DESC`,
    );
    return op.all(userId) as Trigger[];
  });
}

export async function getAllTriggers(): Promise<Trigger[]> {
  return await useDb(async (db) => {
    const op = db.prepare(
      `SELECT id, userId, recipients, note, label, encrypted, checkinIntervalMs, lastIntervalTimestamp, lastCheckinTimestamp, triggerMsSinceLastCheckin, lastTriggerTimestamp, triggerSentNotificationCount
      FROM triggers`,
    );
    return op.all() as Trigger[];
  });
}

async function insertTrigger(
  userId: string,
  input: TriggerInput,
): Promise<Trigger> {
  const now = Date.now();
  const trigger: Trigger = {
    id: randomUUID(),
    userId,
    recipients: input.recipients,
    note: input.note,
    encrypted: input.encrypted,
    label: input.label,
    checkinIntervalMs: input.checkinIntervalMs,
    lastIntervalTimestamp: now,
    lastCheckinTimestamp: now,
    lastTriggerTimestamp: null,
    triggerSentNotificationCount: 0,
    triggerMsSinceLastCheckin: input.triggerMsSinceLastCheckin,
  };

  await useDb(async (db) => {
    const op = db.prepare(
      `INSERT INTO triggers (id, userId, recipients, note, label, encrypted, checkinIntervalMs, lastIntervalTimestamp, lastCheckinTimestamp, triggerMsSinceLastCheckin, triggerSentNotificationCount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    op.run(
      trigger.id,
      trigger.userId,
      trigger.recipients,
      trigger.note,
      trigger.label,
      trigger.encrypted,
      trigger.checkinIntervalMs,
      trigger.lastIntervalTimestamp,
      trigger.lastCheckinTimestamp,
      trigger.triggerMsSinceLastCheckin,
      trigger.triggerSentNotificationCount,
    );
  });

  return trigger;
}

async function updateTrigger(
  userId: string,
  triggerId: string,
  input: TriggerInput,
): Promise<void> {
  await useDb(async (db) => {
    if (input.encrypted) {
      const op = db.prepare(
        `UPDATE triggers
        SET encrypted = ?, recipients = ?, note = ?, label = ?, checkinIntervalMs = ?, triggerMsSinceLastCheckin = ?
        WHERE id = ? AND userId = ?`,
      );
      const result = op.run(
        input.encrypted,
        input.recipients,
        input.note,
        input.label,
        input.checkinIntervalMs,
        input.triggerMsSinceLastCheckin,
        triggerId,
        userId,
      );

      if (!result.changes) {
        throw new InvalidRequestError();
      }
    } else {
      const op = db.prepare(
        `UPDATE triggers
        SET recipients = ?, note = ?, label = ?, checkinIntervalMs = ?, triggerMsSinceLastCheckin = ?
        WHERE id = ? AND userId = ?`,
      );
      const result = op.run(
        input.recipients,
        input.note,
        input.label,
        input.checkinIntervalMs,
        input.triggerMsSinceLastCheckin,
        triggerId,
        userId,
      );

      if (!result.changes) {
        throw new InvalidRequestError();
      }
    }
  });
}

async function deleteTrigger(userId: string, triggerId: string): Promise<void> {
  await useDb(async (db) => {
    const tokensOp = db.prepare(
      `DELETE FROM checkin_tokens WHERE triggerId = ?`,
    );
    tokensOp.run(triggerId);

    const triggerOp = db.prepare(
      `DELETE FROM triggers WHERE id = ? AND userId = ?`,
    );
    const result = triggerOp.run(triggerId, userId);
    if (!result.changes) {
      throw new InvalidRequestError();
    }
  });
}

export async function updateTriggerLastIntervalTimestamp(
  triggerId: string,
  lastIntervalTimestamp: number,
): Promise<void> {
  await useDb(async (db) => {
    const op = db.prepare(
      `UPDATE triggers SET lastIntervalTimestamp = ? WHERE id = ?`,
    );
    op.run(lastIntervalTimestamp, triggerId);
  });
}

export async function updateTriggerLastTriggerTimestamp(
  triggerId: string,
  lastTriggerTimestamp: number,
  count: number,
): Promise<void> {
  await useDb(async (db) => {
    const op = db.prepare(
      `UPDATE triggers SET lastTriggerTimestamp = ?, triggerSentNotificationCount = ? WHERE id = ?`,
    );
    op.run(lastTriggerTimestamp, count, triggerId);
  });
}

export async function updateTriggerLastCheckinTimestamp(
  triggerId: string,
  lastCheckinTimestamp: number,
): Promise<void> {
  await useDb(async (db) => {
    const op = db.prepare(
      `UPDATE triggers SET lastCheckinTimestamp = ? WHERE id = ?`,
    );
    op.run(lastCheckinTimestamp, triggerId);
  });
}

export async function createCheckinToken(
  triggerId: string,
  expiresAt: number,
): Promise<string> {
  const token = randomUUID();
  await useDb(async (db) => {
    const op = db.prepare(
      `INSERT INTO checkin_tokens (id, triggerId, expiresAt) VALUES (?, ?, ?)`,
    );
    op.run(token, triggerId, expiresAt);
  });
  return token;
}

async function getCheckinToken(token: string): Promise<CheckinToken | null> {
  return await useDb(async (db) => {
    const op = db.prepare(
      `SELECT id, triggerId, expiresAt FROM checkin_tokens WHERE id = ?`,
    );
    return (op.get(token) as CheckinToken | undefined) ?? null;
  });
}

async function getTriggerById(triggerId: string): Promise<Trigger | null> {
  return await useDb(async (db) => {
    const op = db.prepare(
      `SELECT id, userId, recipients, note, label, encrypted, checkinIntervalMs, lastIntervalTimestamp, lastCheckinTimestamp, triggerMsSinceLastCheckin, lastTriggerTimestamp
      FROM triggers WHERE id = ?`,
    );
    return (op.get(triggerId) as Trigger | undefined) ?? null;
  });
}

const router = express.Router();

router.get(
  "/api/triggers",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const triggers = await getTriggersByUserId(user.id);
    res.status(200).json({ triggers });
  }),
);

router.post(
  "/api/triggers",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const input = parseTriggerInput(req.body, "create");
    const trigger = await insertTrigger(user.id, input);
    res.status(201).json({ trigger });
  }),
);

router.put(
  "/api/triggers/:triggerId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const input = parseTriggerInput(req.body, "update");
    const { triggerId } = req.params;
    if (!triggerId || Array.isArray(triggerId)) {
      throw new InvalidRequestError();
    }
    await updateTrigger(user.id, triggerId, input);
    res.status(204).end();
  }),
);

router.delete(
  "/api/triggers/:triggerId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const { triggerId } = req.params;
    if (!triggerId || Array.isArray(triggerId)) {
      throw new InvalidRequestError();
    }
    await deleteTrigger(user.id, triggerId);
    res.status(204).end();
  }),
);

router.get(
  "/api/triggers/claim/:triggerId",
  asyncHandler(async (req, res) => {
    const { triggerId } = req.params;
    if (!triggerId || Array.isArray(triggerId)) {
      throw new InvalidRequestError();
    }

    const trigger = await getTriggerById(triggerId);
    if (!trigger) {
      res.status(404).end();
      return;
    }

    if (!isTriggerClaimable(trigger, Date.now())) {
      res.status(404).end();
      return;
    }

    res.status(200).json({
      trigger: {
        note: trigger.note,
        encrypted: trigger.encrypted,
      },
    });
  }),
);

router.post(
  "/api/triggers/checkin/:token",
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    if (!token || Array.isArray(token)) {
      throw new InvalidRequestError();
    }
    const now = Date.now();
    const checkinToken = await getCheckinToken(token);
    if (!checkinToken || checkinToken.expiresAt < now) {
      res.status(404).end();
      return;
    }
    const trigger = await getTriggerById(checkinToken.triggerId);
    if (!trigger) {
      res.status(404).end();
      return;
    }
    await updateTriggerLastCheckinTimestamp(trigger.id, now);
    await uploadCheckinTimestampToS3(trigger.id, now);
    res
      .status(200)
      .type("html")
      .send(
        [
          "<!doctype html>",
          "<html>",
          "<head>",
          '  <meta charset="utf-8" />',
          "  <title>Check-in Successful</title>",
          "</head>",
          "<body>",
          "  <h1>You have checked in successfully.</h1>",
          '  <p><a href="/">Go to the home page</a></p>',
          "</body>",
          "</html>",
        ].join("\n"),
      );
  }),
);

export const triggersRouter = router;
