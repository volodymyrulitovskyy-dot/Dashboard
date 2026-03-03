import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { logAuditEvent } from "@/lib/audit";
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/security/rate-limit";
import { getClientIp, isSameOriginMutationRequest } from "@/lib/security/request";

const bodySchema = z.object({
  teamId: z.string().min(3),
});

export async function POST(request: Request) {
  const sourceIp = getClientIp(request);
  const rateLimit = checkRateLimit(`api:teams:active:${sourceIp}`, {
    maxRequests: 60,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: buildRateLimitHeaders(rateLimit),
      },
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

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid team ID" },
      { status: 400, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  const isMember = session.user.teams.some(
    (team) => team.teamId === parsed.data.teamId,
  );
  if (!isMember) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set("active_team_id", parsed.data.teamId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  await logAuditEvent({
    userId: session.user.id,
    teamId: parsed.data.teamId,
    action: "team.active_switch",
    category: "tenancy",
  });

  return NextResponse.json(
    { ok: true },
    {
      headers: buildRateLimitHeaders(rateLimit),
    },
  );
}
