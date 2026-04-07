import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: Number(optional("PORT", "3001")),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),
  s3: {
    bucket: required("S3_BUCKET"),
    endpoint: process.env["S3_ENDPOINT"],
    region: optional("S3_REGION", "us-east-1"),
    accessKey: required("S3_ACCESS_KEY"),
    secretKey: required("S3_SECRET_KEY"),
  },
  meshyApiKey: required("MESHY_API_KEY"),
  jwtSecret: required("JWT_SECRET"),
} as const;
