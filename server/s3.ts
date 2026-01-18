import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

let s3Client: S3Client | null = null;

const S3_BUCKET = process.env.S3_BUCKET as string;
const AWS_REGION = process.env.AWS_REGION as string;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID as string;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY as string;

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  return s3Client;
}

export async function uploadSnapshotToS3(
  filename: string,
  snapshotData: Uint8Array,
) {
  if (!S3_BUCKET || !AWS_REGION) {
    console.log("skip sync to s3: missing s3 configuration");
    return false;
  }

  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: filename,
      Body: snapshotData,
      ContentType: "application/x-sqlite3",
    }),
  );

  return true;
}

export async function uploadCheckinTimestampToS3(
  triggerId: string,
  timestamp: number,
) {
  if (!S3_BUCKET || !AWS_REGION) {
    console.log("skip checkin upload: missing s3 configuration");
    return false;
  }

  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `checkin/${triggerId}.txt`,
      Body: Buffer.from(timestamp.toString()),
      ContentType: "text/plain",
    }),
  );

  return true;
}

async function bodyToUint8Array(body: unknown) {
  if (!body) {
    return new Uint8Array();
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return new Uint8Array(Buffer.concat(chunks));
  }

  if (
    typeof (body as { arrayBuffer?: () => Promise<ArrayBuffer> })
      .arrayBuffer === "function"
  ) {
    const arrayBuffer = await (
      body as { arrayBuffer: () => Promise<ArrayBuffer> }
    ).arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  throw new Error("unsupported s3 response body");
}

async function bodyToString(body: unknown) {
  const data = await bodyToUint8Array(body);
  return Buffer.from(data).toString("utf8");
}

export async function downloadSnapshotFromS3(filename: string) {
  if (!S3_BUCKET || !AWS_REGION) {
    console.log("skip s3 download: missing s3 configuration");
    return null;
  }

  const s3 = getS3Client();

  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: filename,
      }),
    );

    if (!response.Body) {
      return null;
    }

    return await bodyToUint8Array(response.Body);
  } catch (error) {
    if (error instanceof Error) {
      const errorName = (error as { name?: string }).name;
      if (errorName === "NoSuchKey") {
        return null;
      }
    }
    throw error;
  }
}

export async function downloadCheckinTimestampsFromS3() {
  if (!S3_BUCKET || !AWS_REGION) {
    console.log("skip checkin download: missing s3 configuration");
    return null;
  }

  const s3 = getS3Client();
  const checkins = new Map<string, number>();
  let continuationToken: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: "checkin/",
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents ?? []) {
      const key = object.Key;
      if (!key || !key.startsWith("checkin/") || !key.endsWith(".txt")) {
        continue;
      }

      const triggerId = key.slice("checkin/".length).replace(/\.txt$/, "");
      if (!triggerId) {
        continue;
      }

      const download = await s3.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: key,
        }),
      );

      if (!download.Body) {
        continue;
      }

      const text = (await bodyToString(download.Body)).trim();
      const timestamp = Number(text);
      if (!Number.isFinite(timestamp)) {
        continue;
      }

      checkins.set(triggerId, timestamp);
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return checkins;
}
