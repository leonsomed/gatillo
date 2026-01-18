import {
  getAllTriggers,
  updateTriggerLastIntervalTimestamp,
  type Trigger,
  TRIGGER_THRESHOLD_NOTIFICATION_INTERVAL,
  updateTriggerLastTriggerTimestamp,
  createCheckinToken,
  updateTriggerLastCheckinTimestamp,
} from "./triggers";
import { getUserById } from "./users";
import {
  downloadCheckinTimestampsFromS3,
  uploadCheckinTimestampToS3,
} from "./s3";

function isCheckinDue(trigger: Trigger, now: number) {
  return (
    now - (trigger.lastIntervalTimestamp || 0) >= trigger.checkinIntervalMs
  );
}

function msToTimeSince(ms: number) {
  const hours = ms / 1000 / 60 / 60;

  return `${Math.floor(hours / 24)} days ${hours % 24} hours`;
}

function isCheckinOverThreshold(trigger: Trigger, now: number) {
  return (
    now - trigger.lastCheckinTimestamp >= trigger.triggerMsSinceLastCheckin &&
    now - (trigger.lastTriggerTimestamp || 0) >=
      TRIGGER_THRESHOLD_NOTIFICATION_INTERVAL &&
    trigger.triggerSentNotificationCount < 10
  );
}

async function sendCheckinNotification(trigger: Trigger, now: number) {
  // TODO integrate real delivery (email/local notification/etc).
  const token = await createCheckinToken(
    trigger.id,
    now + trigger.checkinIntervalMs,
  );
  const user = await getUserById(trigger.userId);
  console.info(`check-in due for trigger ${trigger.id} (${trigger.label})`, {
    email: user.email,
    timeSinceLast: msToTimeSince(now - (trigger.lastIntervalTimestamp || 0)),
    url: `http://localhost:3000/api/triggers/checkin/${token}`,
  });
}

async function sendTriggerNotification(trigger: Trigger) {
  // TODO integrate real delivery (email/local notification/etc).
  const recipients = trigger.recipients
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  console.info(`trigger due ${trigger.id} (${trigger.label})`, {
    recipients,
    url: `http://localhost:3000/triggers/claim/${trigger.id}`,
  });
}

async function syncCheckins() {
  if (process.env.DISABLE_SYNC_CHECK_IN) {
    console.warn("syncCheckins disabled");
    return;
  }

  const triggers = await getAllTriggers();
  const checkinsByTriggerId = await downloadCheckinTimestampsFromS3();

  if (checkinsByTriggerId) {
    for (const trigger of triggers) {
      const s3Timestamp = checkinsByTriggerId?.get(trigger.id);

      if (typeof s3Timestamp !== "number") {
        await uploadCheckinTimestampToS3(
          trigger.id,
          trigger.lastCheckinTimestamp,
        );
        continue;
      }

      if (s3Timestamp > trigger.lastCheckinTimestamp) {
        await updateTriggerLastCheckinTimestamp(trigger.id, s3Timestamp);
      } else if (s3Timestamp < trigger.lastCheckinTimestamp) {
        await uploadCheckinTimestampToS3(
          trigger.id,
          trigger.lastCheckinTimestamp,
        );
      }
    }
  }
}

export async function runMonitor() {
  await syncCheckins();
  const triggers = await getAllTriggers();
  const now = Date.now();
  const dueTriggers = triggers.filter((trigger) => isCheckinDue(trigger, now));

  for (const trigger of dueTriggers) {
    await sendCheckinNotification(trigger, now);
    await updateTriggerLastIntervalTimestamp(trigger.id, now);
  }

  const triggersOverThreshold = triggers.filter((trigger) =>
    isCheckinOverThreshold(trigger, now),
  );
  for (const trigger of triggersOverThreshold) {
    await sendTriggerNotification(trigger);
    await updateTriggerLastTriggerTimestamp(
      trigger.id,
      now,
      trigger.triggerSentNotificationCount + 1,
    );
  }
}
