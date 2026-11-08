import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { demo } from "./db";
const client = (browser = false) =>
  new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: browser
      ? process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT
      : process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "",
      secretAccessKey: process.env.S3_SECRET_KEY || "",
    },
  });
export async function putMedia(key: string, data: Buffer, mime: string) {
  if (demo) {
    await mkdir(path.join(process.cwd(), "data/media"), { recursive: true });
    await writeFile(path.join(process.cwd(), "data/media", key), data);
  } else {
    if (!process.env.S3_BUCKET)
      throw new Error(
        "Private storage unavailable: configure S3_BUCKET and credentials.",
      );
    await client().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: data,
        ContentType: mime,
      }),
    );
  }
}
export async function readMedia(key: string) {
  if (demo)
    return readFile(path.join(process.cwd(), "data/media", path.basename(key)));
  const result = await client().send(
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
  );
  return Buffer.from(await result.Body!.transformToByteArray());
}
export async function mediaUrl(key: string, browser = false) {
  return getSignedUrl(
    client(browser),
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    { expiresIn: 60 },
  );
}
