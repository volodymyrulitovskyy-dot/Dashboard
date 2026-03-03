import { env } from "@/lib/env";

const RAMP_TOKEN_ENDPOINT = "https://api.ramp.com/developer/v1/token";
const RAMP_API_BASE_URL = "https://api.ramp.com";
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_COUNT = 2000;

type RampTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

type RampPagedResponse<T> = {
  data?: T[];
  page?: {
    next?: string;
  };
};

type RampBill = {
  amount?: {
    amount?: number;
  };
};

type RampTransaction = {
  amount?: number;
  card_id?: string | null;
};

export type RampApSnapshot = {
  apTotal: number;
  billTotal: number;
  cardTransactionTotal: number;
  billCount: number;
  cardTransactionCount: number;
};

export async function getRampAccessToken() {
  if (!env.RAMP_CLIENT_ID || !env.RAMP_CLIENT_SECRET) {
    throw new Error("Ramp client credentials are not configured");
  }

  const encoded = Buffer.from(
    `${env.RAMP_CLIENT_ID}:${env.RAMP_CLIENT_SECRET}`,
  ).toString("base64");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope:
      env.RAMP_SCOPES ??
      "bills:read vendors:read transactions:read receipts:read reimbursements:read users:read departments:read entities:read",
  });

  const response = await fetch(RAMP_TOKEN_ENDPOINT, {
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
    throw new Error(`Ramp token request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as RampTokenResponse;
}

function asFiniteNumber(input: unknown) {
  const value =
    typeof input === "number" ? input : typeof input === "string" ? Number(input) : NaN;

  return Number.isFinite(value) ? value : 0;
}

function round2(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function billAmountToMajorCurrency(bill: RampBill) {
  const minor = asFiniteNumber(bill.amount?.amount);
  return minor / 100;
}

function transactionAmountToMajorCurrency(txn: RampTransaction) {
  return asFiniteNumber(txn.amount);
}

async function fetchRampJsonWithRetry<T>(url: string, accessToken: string, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxAttempts) {
        const text = await response.text();
        throw new Error(`Ramp API retry exhausted (${response.status}): ${text}`);
      }

      const waitMs = Math.min(2000 * attempt, 10000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ramp API request failed (${response.status}) ${url}: ${text}`);
    }

    return (await response.json()) as T;
  }

  throw new Error(`Ramp API retry exhausted for ${url}`);
}

async function fetchRampPaginated<T>(
  endpoint: string,
  accessToken: string,
  params: Record<string, string>,
) {
  const all: T[] = [];
  let start: string | undefined;

  for (let page = 1; page <= MAX_PAGE_COUNT; page += 1) {
    const query = new URLSearchParams({
      ...params,
      page_size: String(DEFAULT_PAGE_SIZE),
    });

    if (start) {
      query.set("start", start);
    }

    const url = `${RAMP_API_BASE_URL}${endpoint}?${query.toString()}`;
    const payload = await fetchRampJsonWithRetry<RampPagedResponse<T>>(url, accessToken);
    const pageRows = Array.isArray(payload.data) ? payload.data : [];

    all.push(...pageRows);

    const next = payload.page?.next;
    if (!next) {
      break;
    }

    try {
      start = new URL(next).searchParams.get("start") ?? undefined;
    } catch {
      start = undefined;
    }

    if (!start) {
      break;
    }
  }

  return all;
}

export async function getRampApSnapshot(input: {
  periodStartIso: string;
  periodEndIso: string;
}) {
  const token = await getRampAccessToken();

  const [bills, transactions] = await Promise.all([
    fetchRampPaginated<RampBill>("/developer/v1/bills", token.access_token, {
      from_issued_date: input.periodStartIso,
      to_issued_date: input.periodEndIso,
      is_archived: "false",
    }),
    fetchRampPaginated<RampTransaction>("/developer/v1/transactions", token.access_token, {
      from_date: input.periodStartIso,
      to_date: input.periodEndIso,
      order_by_date_asc: "true",
    }),
  ]);

  const billTotal = bills.reduce((sum, bill) => sum + billAmountToMajorCurrency(bill), 0);
  const cardTransactions = transactions.filter((txn) => Boolean(txn.card_id));
  const cardTransactionTotal = cardTransactions.reduce(
    (sum, txn) => sum + transactionAmountToMajorCurrency(txn),
    0,
  );

  return {
    apTotal: round2(Math.abs(billTotal) + Math.abs(cardTransactionTotal)),
    billTotal: round2(Math.abs(billTotal)),
    cardTransactionTotal: round2(Math.abs(cardTransactionTotal)),
    billCount: bills.length,
    cardTransactionCount: cardTransactions.length,
  } satisfies RampApSnapshot;
}
