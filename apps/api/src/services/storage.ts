import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

const s3 = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: true,
});

const PRESIGN_EXPIRES = 3600; // 1 hour

export async function presignUpload(
  key: string,
  contentType: string,
): Promise<{ url: string; key: string }> {
  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRES });
  return { url, key };
}

export async function presignDownload(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRES });
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
    }),
  );
}

export function getObjectUrl(key: string): string {
  const base = config.s3.endpoint ?? `https://s3.${config.s3.region}.amazonaws.com`;
  return `${base}/${config.s3.bucket}/${key}`;
}
