import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
  },
  forcePathStyle: true,
});

const S3_BUCKET = process.env.S3_BUCKET ?? "bonsai3d";

/**
 * Upload a buffer to S3 at the given key.
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * Download an object from S3 and return it as a Buffer.
 */
export async function downloadFromS3(key: string): Promise<Buffer> {
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }),
  );

  if (!result.Body) {
    throw new Error(`S3 object not found: ${key}`);
  }

  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Generate a presigned download URL for an S3 object.
 */
export async function getPresignedUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
}
