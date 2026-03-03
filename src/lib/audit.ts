import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

type AuditInput = {
  action: string;
  category: string;
  userId?: string;
  teamId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

type AuditEvent = AuditInput & { createdAt: string };

const auditStore: AuditEvent[] = [];
const MAX_AUDIT_STORE_SIZE = 1000;
const MAX_AUDIT_METADATA_LENGTH = 8_000;

function serializeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return null;
  }

  try {
    const asJson = JSON.stringify(metadata);
    if (asJson.length <= MAX_AUDIT_METADATA_LENGTH) {
      return asJson;
    }

    return JSON.stringify({
      truncated: true,
      preview: asJson.slice(0, MAX_AUDIT_METADATA_LENGTH),
    });
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

async function persistAuditEvent(event: AuditEvent) {
  try {
    await prisma.auditEvent.create({
      data: {
        action: event.action,
        category: event.category,
        userId: event.userId,
        teamId: event.teamId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        metadata: serializeMetadata(event.metadata),
        createdAt: new Date(event.createdAt),
      },
    });
  } catch (error) {
    logger.warn({ error }, "audit persistence unavailable, using in-memory fallback");
  }
}

function parseMetadata(metadata: string | null) {
  if (!metadata) {
    return undefined;
  }

  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return { parseError: true };
  }
}

export async function logAuditEvent(input: AuditInput) {
  const event: AuditEvent = {
    ...input,
    createdAt: new Date().toISOString(),
  };

  auditStore.unshift(event);
  if (auditStore.length > MAX_AUDIT_STORE_SIZE) {
    auditStore.pop();
  }

  await persistAuditEvent(event);

  logger.info(
    {
      event: {
        action: event.action,
        category: event.category,
        userId: event.userId,
        teamId: event.teamId,
        createdAt: event.createdAt,
      },
    },
    "audit",
  );
}

export async function getRecentAuditEvents(teamId?: string) {
  try {
    const rows = await prisma.auditEvent.findMany({
      where: teamId ? { teamId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return rows.map((row) => ({
      action: row.action,
      category: row.category,
      userId: row.userId ?? undefined,
      teamId: row.teamId ?? undefined,
      ipAddress: row.ipAddress ?? undefined,
      userAgent: row.userAgent ?? undefined,
      metadata: parseMetadata(row.metadata),
      createdAt: row.createdAt.toISOString(),
    }));
  } catch {
    return auditStore
    .filter((event) => (teamId ? event.teamId === teamId : true))
    .slice(0, 100);
  }
}
