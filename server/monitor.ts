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
import { sendEmailViaSmtp } from "./email";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
  const token = await createCheckinToken(
    trigger.id,
    now + trigger.checkinIntervalMs,
  );
  const user = await getUserById(trigger.userId);
  await sendEmailViaSmtp({
    subject: `Gatillo check-in ${trigger.label}`,
    to: user.email,
    content: `This is a check-in reminder for gatillo trigger ${trigger.label}.
Time since last check in ${msToTimeSince(now - (trigger.lastIntervalTimestamp || 0))}.
URL: ${process.env.BASE_URL}/api/triggers/checkin/${token}`,
  });
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `Check-in URL: ${process.env.BASE_URL}/api/triggers/checkin/${token}`,
    );
  }
}

async function sendTriggerNotification(trigger: Trigger) {
  const claimHtmlPath = path.resolve(process.cwd(), "public", "claim.html");
  const claimHtml = await readFile(claimHtmlPath, "utf8");
  const recipients = trigger.recipients
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  for (const recipient of recipients) {
    await sendEmailViaSmtp({
      subject: trigger.subject || "gatillo message",
      to: recipient,
      content: `URL: ${process.env.BASE_URL}/triggers/claim/${trigger.id}.
If the link is not available you can download all attachments and double click claim.html then follow the instructions in that page to upload the message.json file.
${trigger.note}`,
      attachments: [
        {
          filename: "message.json",
          content: JSON.stringify(
            {
              github: "https://github.com/leonsomed/gatillo",
              note: trigger.note,
              encrypted: JSON.parse(trigger.encrypted),
            },
            null,
            2,
          ),
          contentType: "application/json",
        },
        {
          filename: "claim.html",
          content: claimHtml,
          contentType: "text/html",
        },
      ],
    });
  }
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
