import { SignJWT, importPKCS8 } from "jose";

import { env } from "@/lib/env";

export type NetSuiteTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
};

export type NetSuiteLedgerTotals = {
  arTotal: number;
  apTotal: number;
  glTotal: number;
  sourceMode: "endpoint" | "suiteql";
};

export type NetSuiteJournalEntryLineInput = {
  accountId: string;
  debit?: number;
  credit?: number;
  memo?: string;
  dimensions?: Record<string, string | undefined>;
};

export type NetSuiteJournalEntryCreateInput = {
  tranDate: string;
  memo: string;
  externalId?: string;
  subsidiaryId?: string;
  currencyId?: string;
  approvalStatus?: string;
  lines: NetSuiteJournalEntryLineInput[];
};

export type NetSuiteJournalEntryCreateResult = {
  id?: string;
  payload: Record<string, unknown>;
};

type PeriodWindow = {
  periodKey: string;
  periodStartDate: string;
  periodEndDate: string;
};

function normalizePrivateKey(raw: string) {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export async function getNetSuiteAccessToken() {
  if (
    !env.NETSUITE_ACCOUNT_ID ||
    !env.NETSUITE_CLIENT_ID ||
    !env.NETSUITE_CERTIFICATE_ID ||
    !env.NETSUITE_PRIVATE_KEY_PEM
  ) {
    throw new Error("NetSuite OAuth M2M settings are incomplete");
  }

  const endpoint = `https://${env.NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;
  const now = Math.floor(Date.now() / 1000);

  const privateKey = await importPKCS8(
    normalizePrivateKey(env.NETSUITE_PRIVATE_KEY_PEM),
    "PS256",
  );

  const assertion = await new SignJWT({
    iss: env.NETSUITE_CLIENT_ID,
    scope: env.NETSUITE_SCOPES ?? "rest_webservices",
    aud: endpoint,
  })
    .setProtectedHeader({
      typ: "JWT",
      alg: "PS256",
      kid: env.NETSUITE_CERTIFICATE_ID,
    })
    .setIssuedAt(now)
    .setExpirationTime(now + 55 * 60)
    .setJti(crypto.randomUUID())
    .sign(privateKey);

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: assertion,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `NetSuite token request failed (${response.status}): ${text}`,
    );
  }

  return (await response.json()) as NetSuiteTokenResponse;
}

function asFiniteNumber(input: unknown) {
  const value =
    typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;

  return Number.isFinite(value) ? value : 0;
}

function round2(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function getNetSuiteApiRoot() {
  if (!env.NETSUITE_ACCOUNT_ID) {
    throw new Error("NetSuite account id is not configured");
  }

  return `https://${env.NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com`;
}

function buildNetSuiteUrl(pathOrUrl: string) {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }

  const root = getNetSuiteApiRoot();
  return `${root}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

function extractKnownAmount(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in payload) {
      return asFiniteNumber(payload[key]);
    }
  }

  return NaN;
}

function extractFirstNumericValue(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    return NaN;
  }

  for (const value of Object.values(payload)) {
    const numeric = asFiniteNumber(value);
    if (Number.isFinite(numeric) && numeric !== 0) {
      return numeric;
    }
  }

  for (const value of Object.values(payload)) {
    const numeric = asFiniteNumber(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return NaN;
}

function applyQueryTemplate(template: string, period: PeriodWindow) {
  return template
    .replaceAll("{{periodKey}}", period.periodKey)
    .replaceAll("{{periodStartDate}}", period.periodStartDate)
    .replaceAll("{{periodEndDate}}", period.periodEndDate);
}

async function runSuiteQlTotalQuery(
  accessToken: string,
  queryTemplate: string,
  period: PeriodWindow,
) {
  const endpoint = buildNetSuiteUrl("/services/rest/query/v1/suiteql?limit=1");
  const query = applyQueryTemplate(queryTemplate, period);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "transient",
    },
    body: JSON.stringify({ q: query }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`NetSuite SuiteQL request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    items?: Array<Record<string, unknown>>;
  };
  const firstRow = Array.isArray(payload.items) ? payload.items[0] : undefined;
  const value = extractFirstNumericValue(firstRow);

  if (!Number.isFinite(value)) {
    throw new Error("NetSuite SuiteQL response did not include a numeric total");
  }

  return round2(value);
}

async function fetchNetSuiteTotalsFromEndpoint(
  accessToken: string,
  endpoint: string,
  period: PeriodWindow,
) {
  const response = await fetch(buildNetSuiteUrl(endpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      periodKey: period.periodKey,
      periodStartDate: period.periodStartDate,
      periodEndDate: period.periodEndDate,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`NetSuite totals endpoint failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const arTotal = extractKnownAmount(payload, [
    "arTotal",
    "ar_total",
    "accountsReceivableTotal",
    "accounts_receivable_total",
  ]);
  const apTotal = extractKnownAmount(payload, [
    "apTotal",
    "ap_total",
    "accountsPayableTotal",
    "accounts_payable_total",
  ]);
  const glTotal = extractKnownAmount(payload, [
    "glTotal",
    "gl_total",
    "generalLedgerTotal",
    "general_ledger_total",
  ]);

  if (![arTotal, apTotal, glTotal].every((value) => Number.isFinite(value))) {
    throw new Error("NetSuite totals payload is missing ar/ap/gl totals");
  }

  return {
    arTotal: round2(arTotal),
    apTotal: round2(apTotal),
    glTotal: round2(glTotal),
    sourceMode: "endpoint",
  } satisfies NetSuiteLedgerTotals;
}

export async function getNetSuiteLedgerTotals(period: PeriodWindow) {
  const token = await getNetSuiteAccessToken();

  if (env.NETSUITE_TOTALS_ENDPOINT) {
    return fetchNetSuiteTotalsFromEndpoint(
      token.access_token,
      env.NETSUITE_TOTALS_ENDPOINT,
      period,
    );
  }

  if (
    !env.NETSUITE_AR_TOTAL_QUERY ||
    !env.NETSUITE_AP_TOTAL_QUERY ||
    !env.NETSUITE_GL_TOTAL_QUERY
  ) {
    throw new Error(
      "NetSuite totals configuration missing: provide NETSUITE_TOTALS_ENDPOINT or all NETSUITE_*_TOTAL_QUERY values",
    );
  }

  const [arTotal, apTotal, glTotal] = await Promise.all([
    runSuiteQlTotalQuery(token.access_token, env.NETSUITE_AR_TOTAL_QUERY, period),
    runSuiteQlTotalQuery(token.access_token, env.NETSUITE_AP_TOTAL_QUERY, period),
    runSuiteQlTotalQuery(token.access_token, env.NETSUITE_GL_TOTAL_QUERY, period),
  ]);

  return {
    arTotal,
    apTotal,
    glTotal,
    sourceMode: "suiteql",
  } satisfies NetSuiteLedgerTotals;
}

function sanitizeAmount(amount: number | undefined) {
  if (!Number.isFinite(amount)) {
    return 0;
  }

  return round2(Math.abs(amount ?? 0));
}

function buildJournalEntryPayload(input: NetSuiteJournalEntryCreateInput) {
  const payload: Record<string, unknown> = {
    trandate: input.tranDate,
    memo: input.memo,
    line: input.lines.map((lineInput) => {
      const line: Record<string, unknown> = {
        account: { id: lineInput.accountId },
      };

      const debit = sanitizeAmount(lineInput.debit);
      const credit = sanitizeAmount(lineInput.credit);
      if (debit > 0) {
        line.debit = debit;
      }
      if (credit > 0) {
        line.credit = credit;
      }
      if (lineInput.memo) {
        line.memo = lineInput.memo;
      }

      for (const [fieldId, fieldValue] of Object.entries(lineInput.dimensions ?? {})) {
        if (fieldId.trim().length > 0 && fieldValue && fieldValue.trim().length > 0) {
          line[fieldId] = { id: fieldValue };
        }
      }

      return line;
    }),
  };

  if (input.externalId) {
    payload.externalId = input.externalId;
  }

  if (input.subsidiaryId) {
    payload.subsidiary = { id: input.subsidiaryId };
  }

  if (input.currencyId) {
    payload.currency = { id: input.currencyId };
  }

  if (input.approvalStatus) {
    payload.approvalStatus = input.approvalStatus;
  }

  return payload;
}

export async function createNetSuiteJournalEntry(
  input: NetSuiteJournalEntryCreateInput,
): Promise<NetSuiteJournalEntryCreateResult> {
  if (!input.lines.length) {
    throw new Error("Journal entry creation requires at least one line");
  }

  const endpoint = env.NETSUITE_LABOR_JE_ENDPOINT ?? "/services/rest/record/v1/journalEntry";
  const token = await getNetSuiteAccessToken();
  const payload = buildJournalEntryPayload(input);

  const response = await fetch(buildNetSuiteUrl(endpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
      Prefer: "transient",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`NetSuite journal entry create failed (${response.status}): ${text}`);
  }

  const body = (await response.json()) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : undefined;

  return {
    id,
    payload: body,
  };
}
