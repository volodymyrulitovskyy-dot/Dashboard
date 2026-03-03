import { NextResponse } from "next/server";
import { z } from "zod";

import { getTeamIdsWithConfiguredIntegrations } from "@/lib/data/runtime-data";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isSourceIpAllowed } from "@/lib/security/network";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/security/rate-limit";
import { getClientIp, secureEqual } from "@/lib/security/request";
import { runAutomatedReconciliationWorkflow } from "@/lib/workflows/reconciliation-workflow";

const PERIOD_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const querySchema = z.object({
  teamId: z.string().min(3).optional(),
  periodKey: z.string().regex(PERIOD_KEY_PATTERN).optional(),
  dryRun: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

function getSecretFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return request.headers.get("x-workflow-secret") ?? "";
}

function isAuthorizedRequest(request: Request) {
  const configuredSecret = env.WORKFLOW_API_SECRET?.trim();
  if (!configuredSecret) {
    return false;
  }

  const provided = getSecretFromRequest(request).trim();
  if (!provided || provided.length < 20) {
    return false;
  }

  return secureEqual(provided, configuredSecret);
}

function parseConfiguredTeamIds() {
  if (!env.WORKFLOW_TEAM_IDS) {
    return [];
  }

  return env.WORKFLOW_TEAM_IDS.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function POST(request: Request) {
  const sourceIp = getClientIp(request);
  const rateLimit = checkRateLimit(`api:workflows:reconcile:scheduled:${sourceIp}`, {
    maxRequests: 30,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  if (!isAuthorizedRequest(request)) {
    logger.warn({ sourceIp }, "scheduled reconciliation workflow unauthorized request");
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  if (!isSourceIpAllowed(sourceIp, env.WORKFLOW_ALLOWED_IPS)) {
    logger.warn({ sourceIp }, "scheduled reconciliation workflow blocked by IP allowlist");
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  const url = new URL(request.url);
  const query = querySchema.safeParse({
    teamId: url.searchParams.get("teamId") ?? undefined,
    periodKey: url.searchParams.get("periodKey") ?? undefined,
    dryRun: url.searchParams.get("dryRun") ?? undefined,
  });

  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  try {
    const configuredTeamIds = parseConfiguredTeamIds();
    const discoveredTeamIds = await getTeamIdsWithConfiguredIntegrations();
    const teamIds =
      query.data.teamId !== undefined
        ? [query.data.teamId]
        : [...new Set([...configuredTeamIds, ...discoveredTeamIds])];

    if (!teamIds.length) {
      return NextResponse.json(
        { error: "No team IDs configured for scheduled workflow runs" },
        { status: 400, headers: buildRateLimitHeaders(rateLimit) },
      );
    }

    const results = await Promise.all(
      teamIds.map((teamId) =>
        runAutomatedReconciliationWorkflow({
          teamId,
          periodKey: query.data.periodKey,
          trigger: "scheduled",
          executedByUserId: "system-scheduler",
          dryRun: query.data.dryRun,
        }).catch((error: unknown) => ({
          teamId,
          error:
            process.env.NODE_ENV === "production"
              ? "Workflow failed"
              : error instanceof Error
                ? error.message
                : "Workflow failed",
        })),
      ),
    );

    const failures = results.filter(
      (result): result is { teamId: string; error: string } =>
        "error" in result && typeof result.error === "string",
    );

    return NextResponse.json(
      {
        ok: failures.length === 0,
        totalTeams: teamIds.length,
        failedTeams: failures.length,
        results,
      },
      {
        headers: buildRateLimitHeaders(rateLimit),
      },
    );
  } catch (error) {
    logger.error(
      { error, sourceIp },
      "scheduled reconciliation workflow execution failed",
    );
    return NextResponse.json(
      { error: "Workflow execution failed" },
      { status: 500, headers: buildRateLimitHeaders(rateLimit) },
    );
  }
}
