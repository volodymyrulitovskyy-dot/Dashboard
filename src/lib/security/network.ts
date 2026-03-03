function normalizeIp(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  const noBracket = trimmed.replace(/^\[|\]$/g, "");

  // Support IPv6-mapped IPv4 representation.
  if (noBracket.startsWith("::ffff:")) {
    return noBracket.slice(7);
  }

  return noBracket;
}

function parseAllowedIps(value: string | undefined) {
  if (!value) {
    return null;
  }

  const allowed = value
    .split(",")
    .map((item) => normalizeIp(item))
    .filter(Boolean);

  return new Set(allowed);
}

export function isSourceIpAllowed(sourceIp: string, allowedIpsCsv?: string) {
  const allowed = parseAllowedIps(allowedIpsCsv);
  if (!allowed) {
    return true;
  }

  if (allowed.size === 0) {
    return false;
  }

  const normalizedSource = normalizeIp(sourceIp);
  if (!normalizedSource) {
    return false;
  }

  return allowed.has(normalizedSource);
}

