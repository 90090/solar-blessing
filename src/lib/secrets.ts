/**
 * src/lib/secrets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Loads sensitive values from AWS Secrets Manager once per Lambda cold start.
 * Cached after first load — subsequent warm requests use the cached value.
 *
 * Why not just use .env?
 * Lambda environment variables are visible in the AWS console to anyone with
 * IAM access. Secrets Manager is encrypted, audited, and rotatable.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

interface AppSecrets {
  ADMIN_USERNAME:  string;
  ADMIN_PASSWORD:  string; // plain text — we bcrypt it below
  JWT_SECRET:      string;
  RECIPIENT_EMAIL: string;
  SENDER_EMAIL:    string;
}

interface LoadedSecrets {
  adminUsername:     string;
  adminPasswordHash: string;
  jwtSecret:         string;
}

// ── Cache — loaded once per cold start ───────────────────────────────────────

let cached: LoadedSecrets | null = null;

export async function getSecrets(): Promise<LoadedSecrets> {
  // Return cached value on warm invocations
  if (cached) return cached;

  const secretArn = process.env.SECRET_ARN;

  // Dev mode — fall back to env vars / defaults
  if (!secretArn) {
    cached = {
      adminUsername:     process.env.ADMIN_USERNAME     ?? 'admin',
      adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? '',
      jwtSecret:         process.env.JWT_SECRET          ?? 'dev-secret-replace-in-prod',
    };
    return cached;
  }

  // Production — fetch from Secrets Manager
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
  });

  const response = await client.send(new GetSecretValueCommand({
    SecretId: secretArn,
  }));

  const raw: AppSecrets = JSON.parse(response.SecretString ?? '{}');

  // Hash the plain-text password with bcrypt
  // This happens once per cold start (~100ms) — negligible cost
  const bcrypt = await import('bcryptjs');
  const lib    = (bcrypt.default ?? bcrypt) as {
    hash: (plain: string, rounds: number) => Promise<string>;
  };
  const hash = await lib.hash(raw.ADMIN_PASSWORD, 12);

  cached = {
    adminUsername:     raw.ADMIN_USERNAME,
    adminPasswordHash: hash,
    jwtSecret:         raw.JWT_SECRET,
  };

  return cached;
}
