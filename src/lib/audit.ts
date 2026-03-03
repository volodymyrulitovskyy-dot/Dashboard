import { logger } from "@/lib/logger";

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

export async function logAuditEvent(input: AuditInput) {
  const event: AuditEvent = {
    ...input,
    createdAt: new Date().toISOString(),
  };

  auditStore.unshift(event);
  if (auditStore.length > 1000) {
    auditStore.pop();
  }

  logger.info({ event }, "audit");
}

export function getRecentAuditEvents(teamId?: string) {
  return auditStore
    .filter((event) => (teamId ? event.teamId === teamId : true))
    .slice(0, 100);
}
