import fs from "node:fs";
import path from "node:path";

const HISTORY_START = "2024-01-01T00:00:00Z";
const TARGET_START = "2026-01-01T00:00:00Z";
const TARGET_END = "2026-02-28T23:59:59Z";
const PAGE_SIZE = 100;

function loadEnv(filePath) {
  const env = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
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

function normalizeMerchant(tx) {
  return String(
    tx?.merchant_name ?? tx?.merchant_descriptor ?? "<unknown>",
  ).trim().toLowerCase();
}

function txDate(tx) {
  return tx?.user_transaction_time ?? tx?.settlement_date ?? null;
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes("\n") || str.includes("\"")) {
    return `"${str.replace(/\"/g, '""')}"`;
  }
  return str;
}

async function getToken({ clientId, clientSecret, scopes }) {
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
    throw new Error(`Token error ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status} ${url}: ${await response.text()}`);
  }
  return response.json();
}

async function fetchTransactions(accessToken, params) {
  const results = [];
  let start = null;

  for (let i = 0; i < 4000; i += 1) {
    const query = new URLSearchParams({
      ...params,
      page_size: String(PAGE_SIZE),
    });
    if (start) query.set("start", start);

    const url = `https://api.ramp.com/developer/v1/transactions?${query.toString()}`;
    const payload = await fetchJson(url, accessToken);
    const data = Array.isArray(payload?.data) ? payload.data : [];
    results.push(...data);

    const next = payload?.page?.next;
    if (!next) break;
    start = new URL(next).searchParams.get("start");
    if (!start) break;
  }

  return results;
}

async function fetchConnection(accessToken) {
  try {
    return await fetchJson(
      "https://api.ramp.com/developer/v1/accounting/connection",
      accessToken,
    );
  } catch {
    return null;
  }
}

function featureFlags(tx) {
  const receipts = Array.isArray(tx?.receipts) ? tx.receipts.length : 0;
  const hasMemo = Boolean(tx?.memo && String(tx.memo).trim().length > 0);
  const accountingFieldCount = Array.isArray(tx?.accounting_field_selections)
    ? tx.accounting_field_selections.length
    : 0;
  const policyViolationCount = Array.isArray(tx?.policy_violations)
    ? tx.policy_violations.length
    : 0;

  return {
    receipts,
    hasMemo,
    accountingFieldCount,
    policyViolationCount,
    amount: Number(tx?.amount ?? 0),
    hasSkCategory:
      tx?.sk_category_id !== null && tx?.sk_category_id !== undefined,
  };
}

function getSimilarExamples(tx, benchmark, max = 5) {
  const merchant = normalizeMerchant(tx);
  let matches = benchmark.filter((b) => normalizeMerchant(b) === merchant);

  if (!matches.length && tx?.sk_category_id !== null && tx?.sk_category_id !== undefined) {
    matches = benchmark.filter((b) => b?.sk_category_id === tx.sk_category_id);
  }

  if (!matches.length && tx?.merchant_category_code) {
    matches = benchmark.filter(
      (b) => b?.merchant_category_code === tx.merchant_category_code,
    );
  }

  return matches.slice(0, max);
}

function determinePrimaryCause(tx, linkedAt) {
  const f = featureFlags(tx);
  const date = txDate(tx);

  if (tx.__cohort === "A_NOT_APPROVED") {
    return "Awaiting approval";
  }

  if (f.policyViolationCount > 0) {
    return "Policy violation unresolved";
  }

  if (f.accountingFieldCount === 0) {
    return "Missing accounting coding";
  }

  if (f.amount > 75 && f.receipts === 0) {
    return "Missing required receipt";
  }

  if (f.amount > 100 && !f.hasMemo) {
    return "Missing required memo";
  }

  if (tx?.state === "PENDING") {
    return "Transaction not cleared";
  }

  if (linkedAt && date && new Date(date) < linkedAt) {
    return "Pre-connection backlog";
  }

  if (f.amount < 0) {
    return "Refund/credit handling needed";
  }

  return "Connector readiness lag";
}

function buildSuggestions(tx, similarExamples, linkedAt) {
  const suggestions = [];
  const f = featureFlags(tx);

  if (tx.__cohort === "A_NOT_APPROVED") {
    suggestions.push("Approve transaction in Ramp workflow");
  }

  if (f.policyViolationCount > 0) {
    suggestions.push("Resolve policy violation or document exception");
  }

  if (f.accountingFieldCount === 0) {
    suggestions.push("Populate required accounting fields (GL, dept/class/location/entity)");
  }

  if (f.amount > 75 && f.receipts === 0) {
    suggestions.push("Attach receipt image/document");
  }

  if (f.amount > 100 && !f.hasMemo) {
    suggestions.push("Add business-purpose memo");
  }

  if (tx?.state === "PENDING") {
    suggestions.push("Wait for transaction to clear, then retry sync");
  }

  if (f.amount < 0) {
    suggestions.push("Classify as refund/credit and reference original charge in memo");
  }

  if (linkedAt && txDate(tx) && new Date(txDate(tx)) < linkedAt) {
    suggestions.push("Backfill historical backlog via sync/re-export job");
  }

  if (!suggestions.length) {
    suggestions.push("Trigger manual re-sync after connector check");
  }

  const similarCount = similarExamples.length;
  if (similarCount >= 2) {
    const similarReceiptRate =
      similarExamples.filter((s) => featureFlags(s).receipts > 0).length /
      similarCount;
    const similarMemoRate =
      similarExamples.filter((s) => featureFlags(s).hasMemo).length /
      similarCount;
    const similarAcctRate =
      similarExamples.filter((s) => featureFlags(s).accountingFieldCount > 0)
        .length / similarCount;

    if (f.receipts === 0 && similarReceiptRate >= 0.75) {
      suggestions.push("Similar ready transactions usually include receipts");
    }

    if (!f.hasMemo && similarMemoRate >= 0.75) {
      suggestions.push("Similar ready transactions usually include memo");
    }

    if (f.accountingFieldCount === 0 && similarAcctRate >= 0.75) {
      suggestions.push("Similar ready transactions are fully coded in accounting fields");
    }
  }

  return Array.from(new Set(suggestions));
}

function summarizeByKey(records, keyFn) {
  const map = {};
  for (const record of records) {
    const key = keyFn(record);
    map[key] = (map[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]));
}

async function main() {
  const env = loadEnv(path.resolve(process.cwd(), ".env.local"));
  if (!env.RAMP_CLIENT_ID || !env.RAMP_CLIENT_SECRET) {
    throw new Error("RAMP credentials missing in .env.local");
  }

  const scopes = `${env.RAMP_SCOPES ?? ""} accounting:read`.trim();
  const token = await getToken({
    clientId: env.RAMP_CLIENT_ID,
    clientSecret: env.RAMP_CLIENT_SECRET,
    scopes,
  });

  const [targetUniverse, cohortA, cohortB, benchmark, connection] =
    await Promise.all([
      fetchTransactions(token.access_token, {
        from_date: TARGET_START,
        to_date: TARGET_END,
        sync_status: "NOT_SYNC_READY",
        order_by_date_asc: "true",
      }),
      fetchTransactions(token.access_token, {
        from_date: TARGET_START,
        to_date: TARGET_END,
        sync_status: "NOT_SYNC_READY",
        all_requirements_met_and_approved: "false",
        has_been_approved: "false",
        order_by_date_asc: "true",
      }),
      fetchTransactions(token.access_token, {
        from_date: TARGET_START,
        to_date: TARGET_END,
        sync_status: "NOT_SYNC_READY",
        all_requirements_met_and_approved: "false",
        has_been_approved: "true",
        order_by_date_asc: "true",
      }),
      fetchTransactions(token.access_token, {
        from_date: HISTORY_START,
        to_date: TARGET_END,
        all_requirements_met_and_approved: "true",
        has_been_approved: "true",
        order_by_date_asc: "true",
      }),
      fetchConnection(token.access_token),
    ]);

  const targetCardUniverse = targetUniverse.filter((tx) => Boolean(tx?.card_id));
  const cohortACard = cohortA
    .filter((tx) => Boolean(tx?.card_id))
    .map((tx) => ({ ...tx, __cohort: "A_NOT_APPROVED" }));
  const cohortBCard = cohortB
    .filter((tx) => Boolean(tx?.card_id))
    .map((tx) => ({ ...tx, __cohort: "B_APPROVED_BUT_NOT_READY" }));
  const benchmarkCard = benchmark.filter((tx) => Boolean(tx?.card_id));

  const targetCombined = [...cohortACard, ...cohortBCard];

  const linkedAt = connection?.last_linked_at
    ? new Date(connection.last_linked_at)
    : null;

  const rows = targetCombined.map((tx) => {
    const similarExamples = getSimilarExamples(tx, benchmarkCard, 5);
    const suggestions = buildSuggestions(tx, similarExamples, linkedAt);
    const primaryCause = determinePrimaryCause(tx, linkedAt);
    const f = featureFlags(tx);

    return {
      cohort: tx.__cohort,
      id: tx?.id,
      user_transaction_time: tx?.user_transaction_time ?? "",
      merchant: tx?.merchant_name ?? tx?.merchant_descriptor ?? "",
      amount: Number(tx?.amount ?? 0),
      currency: tx?.currency_code ?? "",
      state: tx?.state ?? "",
      sync_status: tx?.sync_status ?? "",
      has_been_approved: tx.__cohort === "B_APPROVED_BUT_NOT_READY",
      all_requirements_met_and_approved: false,
      receipt_count: f.receipts,
      memo_present: f.hasMemo,
      accounting_field_count: f.accountingFieldCount,
      policy_violation_count: f.policyViolationCount,
      primary_cause: primaryCause,
      suggested_edits: suggestions,
      similar_ready_count: similarExamples.length,
      similar_ready_example_ids: similarExamples.map((x) => x.id),
    };
  });

  const summary = {
    generated_at: new Date().toISOString(),
    target_period: {
      start: TARGET_START,
      end: TARGET_END,
    },
    connection_last_linked_at: connection?.last_linked_at ?? null,
    counts: {
      total_transactions_in_target_period: targetCardUniverse.length,
      cohort_A_not_approved: cohortACard.length,
      cohort_B_approved_not_ready: cohortBCard.length,
      combined_target_cohorts: targetCombined.length,
      benchmark_ready_quality_history: benchmarkCard.length,
    },
    primary_cause_distribution: summarizeByKey(rows, (r) => r.primary_cause),
    top_merchants_in_target: summarizeByKey(rows, (r) => r.merchant || "<unknown>"),
    edit_recommendation_distribution: summarizeByKey(
      rows.flatMap((r) => r.suggested_edits.map((edit) => ({ edit }))),
      (x) => x.edit,
    ),
    sample_rows: rows.slice(0, 20),
  };

  const reportsDir = path.resolve(process.cwd(), "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const summaryPath = path.join(
    reportsDir,
    "ramp-janfeb2026-requirement-gap-summary.json",
  );
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  const csvPath = path.join(
    reportsDir,
    "ramp-janfeb2026-suggested-edits.csv",
  );

  const header = [
    "cohort",
    "transaction_id",
    "user_transaction_time",
    "merchant",
    "amount",
    "currency",
    "state",
    "sync_status",
    "has_been_approved",
    "all_requirements_met_and_approved",
    "receipt_count",
    "memo_present",
    "accounting_field_count",
    "policy_violation_count",
    "primary_cause",
    "suggested_edits",
    "similar_ready_count",
    "similar_ready_example_ids",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.cohort,
        row.id,
        row.user_transaction_time,
        row.merchant,
        row.amount,
        row.currency,
        row.state,
        row.sync_status,
        row.has_been_approved,
        row.all_requirements_met_and_approved,
        row.receipt_count,
        row.memo_present,
        row.accounting_field_count,
        row.policy_violation_count,
        row.primary_cause,
        row.suggested_edits.join(" | "),
        row.similar_ready_count,
        row.similar_ready_example_ids.join(";"),
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  fs.writeFileSync(csvPath, lines.join("\n"), "utf8");

  console.log(`Summary written: ${summaryPath}`);
  console.log(`Suggested edits CSV written: ${csvPath}`);
  console.log(
    JSON.stringify(
      {
        counts: summary.counts,
        primary_cause_distribution: summary.primary_cause_distribution,
        top_edit_recommendations: Object.fromEntries(
          Object.entries(summary.edit_recommendation_distribution).slice(0, 10),
        ),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
