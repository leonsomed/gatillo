import { DatabaseSync } from "node:sqlite";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import { downloadSnapshotFromS3, uploadSnapshotToS3 } from "./s3";
import { reportError } from "./errors";

const NODE_NAME = process.env.NODE_NAME as string;
const DB_PATH = process.env.DB_PATH as string;
let dbSync: DatabaseSync | null = null;

function getSnapshotFilename() {
  if (!NODE_NAME) {
    console.log("skip s3 snapshot: missing NODE_NAME");
  }

  return `snapshot_${NODE_NAME || Math.random()}.sqlite`;
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function initDb() {
  const hasDbFile = await fileExists(DB_PATH);
  if (!hasDbFile) {
    const snapshot = await downloadSnapshotFromS3(getSnapshotFilename());
    // TODO the file should be uploaded encrypted and should be decrypted when downloaded
    if (snapshot && snapshot.length > 0) {
      await writeFile(DB_PATH, snapshot);
    }
  }

  dbSync = new DatabaseSync(DB_PATH);

  await useDb(async (db) => {
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE
    );`);

    db.exec(`
    CREATE TABLE IF NOT EXISTS triggers (
      id	TEXT PRIMARY KEY,
      userId	TEXT NOT NULL,
      recipients	TEXT NOT NULL,
      note	TEXT NOT NULL,
      encrypted	TEXT NOT NULL,
      checkinIntervalMs	INTEGER NOT NULL,
      lastIntervalTimestamp	INTEGER NOT NULL,
      lastCheckinTimestamp	INTEGER NOT NULL,
      lastTriggerTimestamp INTEGER,
      triggerMsSinceLastCheckin	INTEGER NOT NULL,
      triggerSentNotificationCount INTEGER NOT NULL,
      label TEXT NOT NULL
    );`);

    db.exec(`
    CREATE TABLE IF NOT EXISTS checkin_tokens (
      id TEXT PRIMARY KEY,
      triggerId TEXT NOT NULL,
      expiresAt INTEGER NOT NULL
    );`);
  });
}

const queue: (() => Promise<unknown>)[] = [];
let head = false;

async function runOp() {
  head = true;
  const op = queue.pop();

  if (!op) {
    head = false;
    return;
  }

  try {
    await op();
  } catch (error) {
    reportError(error, { source: "db.runOp" });
  }
  head = false;

  if (queue.length > 0) {
    runOp();
  }
}

export async function useDb<T>(fn: (db: DatabaseSync) => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const op = async () => {
      try {
        if (!dbSync) {
          throw new Error("dbSync undefined");
        }
        const db = dbSync;
        resolve(await fn(db));
      } catch (e) {
        reject(e);
      }
    };
    queue.unshift(op);

    if (!head) {
      runOp();
    }
  });
}

function toSqliteStringLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

let prevHash = "";

export async function createDbSnapshot() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const outputPath = "sqlite.backup";
  await useDb(async (db) => {
    db.exec(`VACUUM INTO ${toSqliteStringLiteral(outputPath)};`);
  });

  // TODO the file should be uploaded encrypted and should be decrypted when downloaded
  const snapshotData = await readFile(outputPath);
  const hash = crypto.hash("sha256", snapshotData);
  const filename = getSnapshotFilename();

  if (hash !== prevHash) {
    try {
      const uploaded = await uploadSnapshotToS3(filename, snapshotData);
      if (uploaded) {
        console.log("synced to s3");
        prevHash = hash;
      }
    } catch (error) {
      reportError(error, {
        source: "createDbSnapshot",
        details: { filename },
      });
    }
  }

  await rm(outputPath);
}
