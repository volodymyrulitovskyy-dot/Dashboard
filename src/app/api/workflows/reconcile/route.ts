import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { hasRole } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { publicErrorMessage } from "@/lib/security/errors";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/security/rate-limit";
import { getClientIp, isSameOriginMutationRequest } from "@/lib/security/request";
import { runAutomatedReconciliationWorkflow } from "@/lib/workflows/reconciliation-workflow";

const PERIOD_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const bodySchema = z
  .object({
    teamId: z.string().min(3).optional(),
    periodKey: z.string().regex(PERIOD_KEY_PATTERN).optional(),
    dryRun: z.boolean().optional(),
  })
  .optional();

export async function POST(request: Request) {
  const sourceIp = getClientIp(request);
  const rateLimit = checkRateLimit(`api:workflows:reconcile:manual:${sourceIp}`, {
    maxRequests: 20,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  if (!isSameOriginMutationRequest(request)) {
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  const payload = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  const teamId =
    payload.data?.teamId ??
    session.user.activeTeamId ??
    session.user.teams[0]?.teamId;
  if (!teamId) {
    return NextResponse.json(
      { error: "No active team found" },
      { status: 400, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  const activeMembership = session.user.teams.find((team) => team.teamId === teamId);
  if (!activeMembership) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  if (!hasRole(activeMembership.role, "ACCOUNTANT")) {
    return NextResponse.json(
      { error: "Insufficient role to run reconciliation workflow" },
      { status: 403, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  try {
    const result = await runAutomatedReconciliationWorkflow({
      teamId,
      periodKey: payload.data?.periodKey,
      executedByUserId: session.user.id,
      trigger: "manual",
      dryRun: payload.data?.dryRun,
    });

    return NextResponse.json({
      ok: true,
      result,
    }, {
      headers: buildRateLimitHeaders(rateLimit),
    });
  } catch (error) {
    logger.error(
      { error, teamId, sourceIp },
      "manual reconciliation workflow failed",
    );
    return NextResponse.json(
      {
        error: publicErrorMessage(error, "Workflow execution failed"),
      },
      { status: 500, headers: buildRateLimitHeaders(rateLimit) },
    );
  }
}
