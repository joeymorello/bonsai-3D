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
  databaseUrl: optional("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/bonsai3d"),
  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),
  s3: {
    bucket: optional("S3_BUCKET", "bonsai3d"),
    endpoint: optional("S3_ENDPOINT", "http://localhost:9000"),
    region: optional("S3_REGION", "us-east-1"),
    accessKey: optional("S3_ACCESS_KEY", "minioadmin"),
    secretKey: optional("S3_SECRET_KEY", "minioadmin"),
  },
  meshyApiKey: optional("MESHY_API_KEY", "placeholder"),
  jwtSecret: optional("JWT_SECRET", "dev-secret-change-in-production"),
  reconServiceUrl: optional("RECON_SERVICE_URL", "http://localhost:8000"),
} as const;
