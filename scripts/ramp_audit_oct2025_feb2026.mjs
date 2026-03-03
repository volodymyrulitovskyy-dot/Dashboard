import fs from "node:fs";
import path from "node:path";

const PERIOD_START = "2025-10-01";
const PERIOD_END = "2026-02-28";
const PERIOD_START_ISO = "2025-10-01T00:00:00Z";
const PERIOD_END_ISO = "2026-02-28T23:59:59Z";
const PERIOD_END_EXCLUSIVE = "2026-03-01";
const PAGE_SIZE = 100;

function loadEnv(filePath) {
  const env = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inRange(dateStr) {
  const date = parseDate(dateStr);
  if (!date) return false;
  return date >= new Date(`${PERIOD_START}T00:00:00.000Z`) &&
    date < new Date(`${PERIOD_END_EXCLUSIVE}T00:00:00.000Z`);
}

async function getRampAccessToken({ clientId, clientSecret, scopes }) {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: scopes,
  });

  const response = await fetch("https://api.ramp.com/developer/v1/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ramp token failure (${response.status}): ${text}`);
  }

  return response.json();
}

async function fetchJsonWithRetry(url, accessToken, maxAttempts = 5) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 429 || response.status >= 500) {
      const waitMs = Math.min(2000 * attempt, 10000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ramp API failure (${response.status}) ${url}: ${text}`);
    }

    return response.json();
  }

  throw new Error(`Ramp API retry exhausted for URL: ${url}`);
}

async function fetchPaginated({ endpoint, accessToken, params }) {
  const all = [];
  let start = null;
  let pageCount = 0;

  while (true) {
    pageCount += 1;
    if (pageCount > 2000) {
      throw new Error(`Pagination safety stop reached for ${endpoint}`);
    }

    const query = new URLSearchParams({
      ...params,
      page_size: String(PAGE_SIZE),
    });

    if (start) query.set("start", start);

    const url = `https://api.ramp.com${endpoint}?${query.toString()}`;
    const payload = await fetchJsonWithRetry(url, accessToken);

    const pageData = Array.isArray(payload?.data) ? payload.data : [];
    all.push(...pageData);

    const next = payload?.page?.next;
    if (!next) break;

    try {
      const nextUrl = new URL(next);
      start = nextUrl.searchParams.get("start");
    } catch {
      start = null;
    }

    if (!start) break;
  }

  return all;
}

function findDuplicates(records, idKey = "id") {
  const seen = new Set();
  const duplicates = [];
  for (const record of records) {
    const id = record?.[idKey];
    if (!id) continue;
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  return duplicates;
}

function billMinorAmount(bill) {
  return Number(bill?.amount?.amount ?? 0);
}

function lineItemsMinorSum(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + Number(item?.amount?.amount ?? 0), 0);
}

function analyzeBills(bills) {
  const issues = {
    missingVendor: [],
    missingInvoiceNumber: [],
    missingDate: [],
    outOfRangeDate: [],
    nonPositiveAmount: [],
    lineItemAmountMismatch: [],
    paidStatusMismatch: [],
    paidButNotSynced: [],
    approvalNotApproved: [],
    duplicateIds: findDuplicates(bills),
  };

  for (const bill of bills) {
    const id = bill?.id ?? "<missing-id>";
    const issuedOrCreated = bill?.issued_at || bill?.created_at;
    const amount = billMinorAmount(bill);
    const lineItemTotal = lineItemsMinorSum(bill?.line_items) + lineItemsMinorSum(bill?.inventory_line_items);

    if (!bill?.vendor) issues.missingVendor.push(id);
    if (!bill?.invoice_number) issues.missingInvoiceNumber.push(id);
    if (!issuedOrCreated) issues.missingDate.push(id);
    if (issuedOrCreated && !inRange(issuedOrCreated)) issues.outOfRangeDate.push(id);
    if (!(amount > 0)) issues.nonPositiveAmount.push(id);

    if (lineItemTotal > 0 && Math.abs(lineItemTotal - amount) > 1) {
      issues.lineItemAmountMismatch.push({ id, amount, lineItemTotal });
    }

    const status = String(bill?.status ?? "").toUpperCase();
    const paidAt = bill?.paid_at;
    if ((status.includes("PAID") && !paidAt) || (!status.includes("PAID") && paidAt)) {
      issues.paidStatusMismatch.push({ id, status, paid_at: paidAt ?? null });
    }

    if (status.includes("PAID") && bill?.sync_status !== "BILL_SYNCED") {
      issues.paidButNotSynced.push({
        id,
        status,
        sync_status: bill?.sync_status ?? null,
        status_summary: bill?.status_summary ?? null,
      });
    }

    if (bill?.approval_status && bill.approval_status !== "APPROVED") {
      issues.approvalNotApproved.push({
        id,
        approval_status: bill.approval_status,
        status: bill?.status ?? null,
        status_summary: bill?.status_summary ?? null,
      });
    }
  }

  return issues;
}

function transactionMajorAmount(txn) {
  return Number(txn?.amount ?? 0);
}

function txnLineItemsMinorSum(txn) {
  if (!Array.isArray(txn?.line_items)) return 0;
  return txn.line_items.reduce(
    (sum, item) =>
      sum +
      Number(item?.converted_amount?.amount ?? item?.amount?.amount ?? 0),
    0,
  );
}

function analyzeTransactions(transactions) {
  const issues = {
    missingCardId: [],
    missingDate: [],
    outOfRangeDate: [],
    zeroAmount: [],
    settlementBeforeTransaction: [],
    lineItemAmountMismatch: [],
    clearedNotSyncReady: [],
    missingReceiptOver75: [],
    missingMemoOver100: [],
    duplicateIds: findDuplicates(transactions),
  };

  for (const txn of transactions) {
    const id = txn?.id ?? "<missing-id>";
    const txnDate = txn?.user_transaction_time || txn?.settlement_date;
    const majorAmount = transactionMajorAmount(txn);

    if (!txn?.card_id) issues.missingCardId.push(id);
    if (!txnDate) issues.missingDate.push(id);
    if (txnDate && !inRange(txnDate)) issues.outOfRangeDate.push(id);
    if (majorAmount === 0) issues.zeroAmount.push(id);

    const settled = parseDate(txn?.settlement_date);
    const transacted = parseDate(txn?.user_transaction_time);
    if (settled && transacted && settled < transacted) {
      issues.settlementBeforeTransaction.push({
        id,
        user_transaction_time: txn?.user_transaction_time,
        settlement_date: txn?.settlement_date,
      });
    }

    const lineMinor = txnLineItemsMinorSum(txn);
    if (lineMinor > 0) {
      const majorAsMinor = Math.round(majorAmount * 100);
      if (Math.abs(majorAsMinor - lineMinor) > 1) {
        issues.lineItemAmountMismatch.push({
          id,
          amount_major: majorAmount,
          amount_minor_from_major: majorAsMinor,
          line_items_minor: lineMinor,
        });
      }
    }

    if (txn?.state === "CLEARED" && txn?.sync_status !== "SYNC_READY") {
      issues.clearedNotSyncReady.push({
        id,
        sync_status: txn?.sync_status ?? null,
        state: txn?.state ?? null,
      });
    }

    const receipts = Array.isArray(txn?.receipts) ? txn.receipts : [];
    if (majorAmount > 75 && receipts.length === 0) {
      issues.missingReceiptOver75.push({
        id,
        amount: majorAmount,
        merchant_name: txn?.merchant_name ?? null,
      });
    }

    if (majorAmount > 100 && !txn?.memo) {
      issues.missingMemoOver100.push({
        id,
        amount: majorAmount,
        merchant_name: txn?.merchant_name ?? null,
      });
    }
  }

  return issues;
}

function summarizeIssues(issues) {
  const summary = {};
  for (const [key, value] of Object.entries(issues)) {
    summary[key] = Array.isArray(value) ? value.length : 0;
  }
  return summary;
}

function takeSamples(issues, max = 10) {
  const out = {};
  for (const [key, value] of Object.entries(issues)) {
    out[key] = Array.isArray(value) ? value.slice(0, max) : value;
  }
  return out;
}

async function main() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env.local at ${envPath}`);
  }

  const localEnv = loadEnv(envPath);
  const clientId = localEnv.RAMP_CLIENT_ID;
  const clientSecret = localEnv.RAMP_CLIENT_SECRET;
  const scopes =
    localEnv.RAMP_SCOPES ||
    "bills:read vendors:read transactions:read receipts:read reimbursements:read users:read departments:read entities:read";

  if (!clientId || !clientSecret) {
    throw new Error("RAMP_CLIENT_ID or RAMP_CLIENT_SECRET is missing in .env.local");
  }

  console.log(`Pulling Ramp data for ${PERIOD_START} through ${PERIOD_END} ...`);
  const token = await getRampAccessToken({ clientId, clientSecret, scopes });

  const [bills, transactionsRaw] = await Promise.all([
    fetchPaginated({
      endpoint: "/developer/v1/bills",
      accessToken: token.access_token,
      params: {
        from_issued_date: PERIOD_START_ISO,
        to_issued_date: PERIOD_END_ISO,
        is_archived: "false",
      },
    }),
    fetchPaginated({
      endpoint: "/developer/v1/transactions",
      accessToken: token.access_token,
      params: {
        from_date: PERIOD_START_ISO,
        to_date: PERIOD_END_ISO,
        order_by_date_asc: "true",
      },
    }),
  ]);

  const transactions = transactionsRaw.filter((txn) => Boolean(txn?.card_id));

  const billIssues = analyzeBills(bills);
  const transactionIssues = analyzeTransactions(transactions);

  const report = {
    generated_at: new Date().toISOString(),
    period: {
      start: PERIOD_START,
      end: PERIOD_END,
    },
    fetch_counts: {
      bills: bills.length,
      transactions_all: transactionsRaw.length,
      transactions_card_only: transactions.length,
    },
    bill_issue_summary: summarizeIssues(billIssues),
    transaction_issue_summary: summarizeIssues(transactionIssues),
    bill_issue_samples: takeSamples(billIssues, 15),
    transaction_issue_samples: takeSamples(transactionIssues, 15),
  };

  const outDir = path.resolve(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const billsFile = path.join(outDir, "ramp-oct2025-feb2026-bills.json");
  const transactionsFile = path.join(
    outDir,
    "ramp-oct2025-feb2026-card-transactions.json",
  );
  const outFile = path.join(outDir, "ramp-oct2025-feb2026-audit.json");
  fs.writeFileSync(billsFile, JSON.stringify(bills, null, 2), "utf8");
  fs.writeFileSync(transactionsFile, JSON.stringify(transactions, null, 2), "utf8");
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");

  console.log("Done.");
  console.log(`Bills written to: ${billsFile}`);
  console.log(`Card transactions written to: ${transactionsFile}`);
  console.log(`Report written to: ${outFile}`);
  console.log("Summary:");
  console.log(JSON.stringify({
    fetch_counts: report.fetch_counts,
    bill_issue_summary: report.bill_issue_summary,
    transaction_issue_summary: report.transaction_issue_summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
