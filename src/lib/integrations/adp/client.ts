import { env } from "@/lib/env";

type AdpTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

export type AdpGrossWageRow = {
  employeeExternalId: string;
  grossWages: number;
  currency?: string;
};

type PeriodWindow = {
  periodKey: string;
  periodStartDate: string;
  periodEndDate: string;
};

function asFiniteNumber(input: unknown) {
  const value =
    typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;

  return Number.isFinite(value) ? value : 0;
}

function round2(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function getAdpBaseUrl() {
  if (!env.ADP_API_BASE_URL) {
    throw new Error("ADP_API_BASE_URL is required for labor distribution workflow");
  }

  return env.ADP_API_BASE_URL.replace(/\/+$/, "");
}

function buildAdpUrl(pathOrUrl: string) {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }

  const baseUrl = getAdpBaseUrl();
  return `${baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

async function getAdpAccessToken() {
  if (env.ADP_API_TOKEN) {
    return env.ADP_API_TOKEN;
  }

  if (!env.ADP_CLIENT_ID || !env.ADP_CLIENT_SECRET) {
    throw new Error(
      "ADP credentials missing: set ADP_API_TOKEN or ADP_CLIENT_ID/ADP_CLIENT_SECRET",
    );
  }

  const tokenEndpoint = env.ADP_TOKEN_ENDPOINT ?? "/oauth2/v1/token";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
  });

  if (env.ADP_SCOPES) {
    body.set("scope", env.ADP_SCOPES);
  }

  const encoded = Buffer.from(`${env.ADP_CLIENT_ID}:${env.ADP_CLIENT_SECRET}`).toString(
    "base64",
  );
  const response = await fetch(buildAdpUrl(tokenEndpoint), {
    method: "POST",
    headers: {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ADP token request failed (${response.status}): ${text}`);
  }

  const token = (await response.json()) as AdpTokenResponse;
  if (!token.access_token) {
    throw new Error("ADP token response missing access_token");
  }

  return token.access_token;
}

function extractRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter(
      (value): value is Record<string, unknown> =>
        typeof value === "object" && value !== null,
    );
  }

  if (payload && typeof payload === "object") {
    const asRecord = payload as Record<string, unknown>;
    const candidates = [
      asRecord.data,
      asRecord.items,
      asRecord.rows,
      asRecord.records,
      asRecord.results,
      asRecord.workers,
      asRecord.payroll,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter(
          (value): value is Record<string, unknown> =>
            typeof value === "object" && value !== null,
        );
      }
    }
  }

  return [];
}

function extractString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function extractNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const number = asFiniteNumber(value);
    if (Number.isFinite(number) && number !== 0) {
      return number;
    }
  }

  for (const key of keys) {
    const value = record[key];
    const number = asFiniteNumber(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }

  return NaN;
}

function mapGrossWageRecord(record: Record<string, unknown>) {
  const employeeExternalId = extractString(record, [
    "employeeExternalId",
    "employee_external_id",
    "employeeId",
    "employee_id",
    "associateOID",
    "workerId",
    "worker_id",
  ]);

  const grossWages = extractNumber(record, [
    "grossWages",
    "gross_wages",
    "grossPay",
    "gross_pay",
    "grossAmount",
    "gross_amount",
    "amount",
  ]);

  const currency = extractString(record, ["currency", "currencyCode", "currency_code"]);
  return {
    employeeExternalId,
    grossWages: round2(grossWages),
    currency: currency || undefined,
  } satisfies AdpGrossWageRow;
}

export async function getAdpGrossWagesByEmployee(period: PeriodWindow) {
  const endpoint = env.ADP_PAYROLL_ENDPOINT ?? "/api/payroll/v1/gross-wages";
  const token = await getAdpAccessToken();
  const url = buildAdpUrl(endpoint);
  const requestPayload = {
    periodKey: period.periodKey,
    periodStartDate: period.periodStartDate,
    periodEndDate: period.periodEndDate,
  };

  const postResponse = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestPayload),
    cache: "no-store",
  });

  let payload: unknown;
  if (postResponse.status === 405) {
    const query = new URLSearchParams(requestPayload);
    const getResponse = await fetch(`${url}?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!getResponse.ok) {
      const text = await getResponse.text();
      throw new Error(`ADP payroll request failed (${getResponse.status}): ${text}`);
    }

    payload = await getResponse.json();
  } else {
    if (!postResponse.ok) {
      const text = await postResponse.text();
      throw new Error(`ADP payroll request failed (${postResponse.status}): ${text}`);
    }

    payload = await postResponse.json();
  }

  const rows = extractRows(payload).map(mapGrossWageRecord).filter((row) => {
    return row.employeeExternalId.length > 0 && Number.isFinite(row.grossWages);
  });

  const totalsByEmployee = new Map<string, number>();
  let totalGrossWages = 0;

  for (const row of rows) {
    const current = totalsByEmployee.get(row.employeeExternalId) ?? 0;
    const nextValue = round2(current + row.grossWages);
    totalsByEmployee.set(row.employeeExternalId, nextValue);
    totalGrossWages = round2(totalGrossWages + row.grossWages);
  }

  return {
    rows: Array.from(totalsByEmployee.entries()).map(([employeeExternalId, grossWages]) => ({
      employeeExternalId,
      grossWages,
    })),
    rowCount: rows.length,
    employeeCount: totalsByEmployee.size,
    totalGrossWages,
  };
}
