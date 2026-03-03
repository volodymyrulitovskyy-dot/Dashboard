import { env } from "@/lib/env";

type UnanetTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

export type UnanetLedgerTotals = {
  arTotal: number;
  apTotal: number;
  glTotal: number;
  rowCount: number;
  sourceMode: "static-token" | "oauth-client-credentials";
};

export type UnanetTimesheetRow = {
  employeeExternalId: string;
  projectExternalId: string;
  hours: number;
  workDate?: string;
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

function getBaseUrl() {
  if (!env.UNANET_API_BASE_URL) {
    throw new Error("UNANET_API_BASE_URL is required for API reconciliation");
  }

  return env.UNANET_API_BASE_URL.replace(/\/+$/, "");
}

function buildUnanetUrl(pathOrUrl: string) {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }

  const baseUrl = getBaseUrl();
  return `${baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

function extractKnownAmount(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in payload) {
      return asFiniteNumber(payload[key]);
    }
  }

  return NaN;
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
      asRecord.timesheets,
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

async function getUnanetAccessToken() {
  if (env.UNANET_API_TOKEN) {
    return {
      accessToken: env.UNANET_API_TOKEN,
      sourceMode: "static-token" as const,
    };
  }

  if (!env.UNANET_CLIENT_ID || !env.UNANET_CLIENT_SECRET) {
    throw new Error(
      "Unanet credentials missing: set UNANET_API_TOKEN or UNANET_CLIENT_ID/UNANET_CLIENT_SECRET",
    );
  }

  const tokenEndpoint = env.UNANET_TOKEN_ENDPOINT ?? "/oauth/token";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
  });

  if (env.UNANET_SCOPES) {
    body.set("scope", env.UNANET_SCOPES);
  }

  const encoded = Buffer.from(
    `${env.UNANET_CLIENT_ID}:${env.UNANET_CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch(buildUnanetUrl(tokenEndpoint), {
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
    throw new Error(`Unanet token request failed (${response.status}): ${text}`);
  }

  const token = (await response.json()) as UnanetTokenResponse;
  if (!token.access_token) {
    throw new Error("Unanet token response missing access_token");
  }

  return {
    accessToken: token.access_token,
    sourceMode: "oauth-client-credentials" as const,
  };
}

async function fetchUnanetTotalsPayload(
  accessToken: string,
  endpoint: string,
  period: PeriodWindow,
) {
  const url = buildUnanetUrl(endpoint);
  const requestBody = {
    periodKey: period.periodKey,
    periodStartDate: period.periodStartDate,
    periodEndDate: period.periodEndDate,
  };

  const postResponse = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });

  if (postResponse.status === 405) {
    const query = new URLSearchParams(requestBody);
    const getResponse = await fetch(`${url}?${query.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!getResponse.ok) {
      const text = await getResponse.text();
      throw new Error(`Unanet totals request failed (${getResponse.status}): ${text}`);
    }

    return (await getResponse.json()) as Record<string, unknown>;
  }

  if (!postResponse.ok) {
    const text = await postResponse.text();
    throw new Error(`Unanet totals request failed (${postResponse.status}): ${text}`);
  }

  return (await postResponse.json()) as Record<string, unknown>;
}

export async function getUnanetLedgerTotals(period: PeriodWindow) {
  const endpoint = env.UNANET_TOTALS_ENDPOINT ?? "/api/v1/finance/reconciliation/totals";
  const auth = await getUnanetAccessToken();
  const payload = await fetchUnanetTotalsPayload(auth.accessToken, endpoint, period);

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
  const rowCount = extractKnownAmount(payload, [
    "rowCount",
    "row_count",
    "recordCount",
    "record_count",
    "totalRows",
    "total_rows",
  ]);

  if (![arTotal, apTotal, glTotal].every((value) => Number.isFinite(value))) {
    throw new Error("Unanet totals payload is missing ar/ap/gl totals");
  }

  return {
    arTotal: round2(arTotal),
    apTotal: round2(apTotal),
    glTotal: round2(glTotal),
    rowCount: Math.max(0, Math.round(asFiniteNumber(rowCount))),
    sourceMode: auth.sourceMode,
  } satisfies UnanetLedgerTotals;
}

export async function getUnanetTimesheetsByProject(period: PeriodWindow) {
  const endpoint = env.UNANET_TIMESHEETS_ENDPOINT ?? "/api/v1/timesheets/hours-by-project";
  const auth = await getUnanetAccessToken();
  const payload = await fetchUnanetTotalsPayload(auth.accessToken, endpoint, period);

  const rows = extractRows(payload)
    .map((record) => {
      const employeeExternalId = extractString(record, [
        "employeeExternalId",
        "employee_external_id",
        "employeeId",
        "employee_id",
        "workerId",
        "worker_id",
      ]);
      const projectExternalId = extractString(record, [
        "projectExternalId",
        "project_external_id",
        "projectId",
        "project_id",
        "jobId",
        "job_id",
        "projectCode",
        "project_code",
      ]);
      const hours = extractNumber(record, [
        "hours",
        "hoursWorked",
        "hours_worked",
        "totalHours",
        "total_hours",
      ]);
      const workDate = extractString(record, [
        "workDate",
        "work_date",
        "date",
        "timesheetDate",
        "timesheet_date",
      ]);

      return {
        employeeExternalId,
        projectExternalId,
        hours: round2(hours),
        workDate: workDate || undefined,
      } satisfies UnanetTimesheetRow;
    })
    .filter((row) => {
      return (
        row.employeeExternalId.length > 0 &&
        row.projectExternalId.length > 0 &&
        Number.isFinite(row.hours) &&
        row.hours > 0
      );
    });

  const totalsByEmployee = new Map<string, number>();
  let totalHours = 0;

  for (const row of rows) {
    totalHours = round2(totalHours + row.hours);
    const current = totalsByEmployee.get(row.employeeExternalId) ?? 0;
    totalsByEmployee.set(row.employeeExternalId, round2(current + row.hours));
  }

  return {
    rows,
    rowCount: rows.length,
    employeeCount: totalsByEmployee.size,
    totalHours,
    sourceMode: auth.sourceMode,
  };
}
