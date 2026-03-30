import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getConfig, getDataDir } from './config.js';
import type { LicenseStatus, LicenseTier } from '../types.js';

const CACHE_FILE = 'license-cache.json';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface LicenseCache {
  key: string;
  valid: boolean;
  tier: LicenseTier;
  expiresAt: string | null;
  cachedAt: number;
}

function getCachePath(): string {
  return join(getDataDir(), CACHE_FILE);
}

function readCache(): LicenseCache | null {
  try {
    const raw = readFileSync(getCachePath(), 'utf-8');
    const cache = JSON.parse(raw) as LicenseCache;
    if (Date.now() - cache.cachedAt < CACHE_TTL_MS) {
      return cache;
    }
    return null; // expired
  } catch {
    return null;
  }
}

function writeCache(cache: LicenseCache): void {
  try {
    writeFileSync(getCachePath(), JSON.stringify(cache, null, 2));
  } catch {
    // non-fatal — continue without cache
  }
}

function isValidKeyFormat(key: string): boolean {
  return /^truss_[0-9a-f]{32}$/.test(key);
}

async function validateRemote(key: string): Promise<{ valid: boolean; expiresAt: string | null }> {
  const config = getConfig();
  const url = `${config.trussApiBaseUrl}/validate/${key}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': '@truss-dev/email-triage-mcp/1.0.0',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return { valid: false, expiresAt: null };
    }

    const body = await response.json() as { valid: boolean; expires_at?: string };
    return {
      valid: body.valid === true,
      expiresAt: body.expires_at ?? null,
    };
  } catch {
    // Network error — fall back to format check + cache
    return { valid: isValidKeyFormat(key), expiresAt: null };
  }
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  const config = getConfig();
  const key = config.licenseKey;

  // No key → free tier
  if (!key) {
    return {
      tier: 'free',
      valid: true,
      expiresAt: null,
      remainingClassifications: null, // will be resolved by usage tracker
    };
  }

  // Format check
  if (!isValidKeyFormat(key)) {
    return {
      tier: 'free',
      valid: false,
      expiresAt: null,
      remainingClassifications: null,
    };
  }

  // Check cache first
  const cached = readCache();
  if (cached && cached.key === key) {
    return {
      tier: cached.tier,
      valid: cached.valid,
      expiresAt: cached.expiresAt,
      remainingClassifications: cached.tier === 'pro' ? null : undefined as unknown as null,
    };
  }

  // Remote validation
  const result = await validateRemote(key);

  const tier: LicenseTier = result.valid ? 'pro' : 'free';

  // Cache the result
  writeCache({
    key,
    valid: result.valid,
    tier,
    expiresAt: result.expiresAt,
    cachedAt: Date.now(),
  });

  return {
    tier,
    valid: result.valid,
    expiresAt: result.expiresAt,
    remainingClassifications: tier === 'pro' ? null : undefined as unknown as null,
  };
}

export async function requirePro(): Promise<void> {
  const status = await getLicenseStatus();
  if (status.tier !== 'pro') {
    throw new Error(
      'This feature requires a TRUSS Pro license ($25/mo). ' +
      'Subscribe at https://buy.stripe.com/28E00igAv4605cWfXL7wA06 and set TRUSS_LICENSE_KEY.'
    );
  }
}
