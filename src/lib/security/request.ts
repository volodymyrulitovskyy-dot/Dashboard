import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

function extractFirstForwardedIp(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const forwardedIp = extractFirstForwardedIp(forwardedFor);
    if (forwardedIp) {
      return forwardedIp;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return "unknown";
}

function readHeaderValue(
  headers:
    | Record<string, string | string[] | undefined>
    | Headers
    | undefined,
  key: string,
) {
  if (!headers) {
    return "";
  }

  if (headers instanceof Headers) {
    return headers.get(key) ?? headers.get(key.toLowerCase()) ?? "";
  }

  const value = headers[key] ?? headers[key.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function getClientIpFromUnknownRequest(req: unknown) {
  if (!req || typeof req !== "object") {
    return "unknown";
  }

  const asRecord = req as Record<string, unknown>;
  const headersValue = asRecord.headers;
  const headers =
    headersValue instanceof Headers
      ? headersValue
      : headersValue && typeof headersValue === "object"
        ? (headersValue as Record<string, string | string[] | undefined>)
        : undefined;

  const forwarded = readHeaderValue(headers, "x-forwarded-for");
  if (forwarded) {
    const first = extractFirstForwardedIp(forwarded);
    if (first) {
      return first;
    }
  }

  const realIp = readHeaderValue(headers, "x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

function normalizeForSecureCompare(value: string) {
  return value.trim();
}

export function secureEqual(left: string, right: string) {
  const leftNormalized = normalizeForSecureCompare(left);
  const rightNormalized = normalizeForSecureCompare(right);

  // Compare fixed-size hashes to avoid leaking length information.
  const leftHash = createHash("sha256").update(leftNormalized, "utf8").digest();
  const rightHash = createHash("sha256").update(rightNormalized, "utf8").digest();

  return timingSafeEqual(leftHash, rightHash);
}

function collectAllowedOrigins(request: Request) {
  const origins = new Set<string>();

  try {
    origins.add(new URL(request.url).origin);
  } catch {}

  if (env.NEXTAUTH_URL) {
    try {
      origins.add(new URL(env.NEXTAUTH_URL).origin);
    } catch {}
  }

  return origins;
}

function extractOrigin(headerValue: string | null) {
  if (!headerValue) {
    return "";
  }

  try {
    return new URL(headerValue).origin;
  } catch {
    return "";
  }
}

export function isSameOriginMutationRequest(request: Request) {
  const allowedOrigins = collectAllowedOrigins(request);
  if (!allowedOrigins.size) {
    return false;
  }

  const origin = extractOrigin(request.headers.get("origin"));
  if (origin) {
    return allowedOrigins.has(origin);
  }

  const referer = extractOrigin(request.headers.get("referer"));
  if (referer) {
    return allowedOrigins.has(referer);
  }

  return false;
}
