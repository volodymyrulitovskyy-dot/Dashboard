import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const teamSeeds = [
  {
    id: "team-finance-ops",
    name: "Finance Operations",
    slug: "finance-ops",
    connections: [
      {
        type: "RAMP",
        status: "CONNECTED",
        displayName: "Ramp AP",
        scope: "bills:read vendors:read transactions:read receipts:read",
        metadata: JSON.stringify({ mode: "oauth2-client-credentials" }),
      },
      {
        type: "NETSUITE",
        status: "CONNECTED",
        displayName: "NetSuite ERP",
        scope: "rest_webservices",
        metadata: JSON.stringify({ mode: "oauth2-m2m", account: "PRODUCTION" }),
      },
      {
        type: "UNANET",
        status: "CONNECTED",
        displayName: "Unanet Export Feed",
        scope: "csv-export",
        metadata: JSON.stringify({ transport: "sftp-dropbox" }),
      },
    ],
    importJobs: [
      {
        source: "UNANET",
        status: "SUCCEEDED",
        objectType: "AR_OPEN_INVOICES",
        runKey: "unanet-ar-2026-02-28",
        rowCount: 1240,
        successCount: 1240,
        failureCount: 0,
        controlTotal: 1954203.18,
      },
      {
        source: "RAMP",
        status: "SUCCEEDED",
        objectType: "AP_BILLS",
        runKey: "ramp-ap-2026-02-28",
        rowCount: 388,
        successCount: 385,
        failureCount: 3,
        controlTotal: 412882.77,
      },
      {
        source: "UNANET",
        status: "RUNNING",
        objectType: "GL_DETAIL",
        runKey: "unanet-gl-2026-02-28",
        rowCount: 98012,
        successCount: 95210,
        failureCount: 0,
        controlTotal: 12889342.99,
      },
    ],
    reconciliations: [
      {
        periodKey: "2026-02",
        sourceSystem: "Unanet AR",
        targetSystem: "NetSuite AR",
        status: "MATCHED",
        sourceAmount: 1954203.18,
        targetAmount: 1954203.18,
        varianceAmount: 0.0,
        variancePercent: 0.0,
        notes: "AR subledger tie-out complete.",
      },
      {
        periodKey: "2026-02",
        sourceSystem: "Ramp AP",
        targetSystem: "NetSuite AP",
        status: "VARIANCE",
        sourceAmount: 412882.77,
        targetAmount: 410884.77,
        varianceAmount: 1998.0,
        variancePercent: 0.0048,
        notes: "Three receipts pending coding approval.",
      },
      {
        periodKey: "2026-02",
        sourceSystem: "Unanet GL",
        targetSystem: "NetSuite GL",
        status: "PENDING",
        sourceAmount: 12889342.99,
        targetAmount: 0.0,
        varianceAmount: 12889342.99,
        variancePercent: 1.0,
        notes: "Import currently running.",
      },
    ],
  },
  {
    id: "team-corporate-close",
    name: "Corporate Close",
    slug: "corp-close",
    connections: [
      {
        type: "RAMP",
        status: "CONNECTED",
        displayName: "Ramp AP Corporate",
        scope: "bills:read vendors:read transactions:read",
        metadata: JSON.stringify({ mode: "oauth2-client-credentials" }),
      },
      {
        type: "NETSUITE",
        status: "CONNECTED",
        displayName: "NetSuite Corporate",
        scope: "rest_webservices",
        metadata: JSON.stringify({ mode: "oauth2-m2m", account: "CORP" }),
      },
      {
        type: "UNANET",
        status: "CONNECTED",
        displayName: "Unanet GL Export",
        scope: "csv-export",
        metadata: JSON.stringify({ transport: "sftp-dropbox" }),
      },
    ],
    importJobs: [
      {
        source: "UNANET",
        status: "SUCCEEDED",
        objectType: "GL_DETAIL",
        runKey: "unanet-gl-2026-02-28-corp",
        rowCount: 65012,
        successCount: 65012,
        failureCount: 0,
        controlTotal: 8891222.45,
      },
      {
        source: "RAMP",
        status: "FAILED",
        objectType: "AP_BILLS",
        runKey: "ramp-ap-2026-02-28-corp",
        rowCount: 288,
        successCount: 271,
        failureCount: 17,
        controlTotal: 348010.21,
      },
    ],
    reconciliations: [
      {
        periodKey: "2026-02",
        sourceSystem: "Unanet GL",
        targetSystem: "NetSuite GL",
        status: "MATCHED",
        sourceAmount: 8891222.45,
        targetAmount: 8891222.45,
        varianceAmount: 0.0,
        variancePercent: 0.0,
        notes: "Corporate GL tie-out complete.",
      },
    ],
  },
];

async function main() {
  for (const seed of teamSeeds) {
    const conflictingTeam = await prisma.team.findUnique({
      where: { slug: seed.slug },
      select: { id: true },
    });

    if (conflictingTeam && conflictingTeam.id !== seed.id) {
      await prisma.team.delete({
        where: { id: conflictingTeam.id },
      });
    }

    const team = await prisma.team.upsert({
      where: { id: seed.id },
      update: { name: seed.name, slug: seed.slug },
      create: {
        id: seed.id,
        name: seed.name,
        slug: seed.slug,
      },
    });

    for (const connection of seed.connections) {
      await prisma.integrationConnection.upsert({
        where: {
          teamId_type: {
            teamId: team.id,
            type: connection.type,
          },
        },
        update: {
          ...connection,
          teamId: team.id,
          lastSyncAt: new Date(),
        },
        create: {
          ...connection,
          teamId: team.id,
          lastSyncAt: new Date(),
        },
      });
    }

    await prisma.dataImportJob.deleteMany({ where: { teamId: team.id } });
    await prisma.reconciliationRun.deleteMany({ where: { teamId: team.id } });

    await prisma.dataImportJob.createMany({
      data: seed.importJobs.map((job, index) => ({
        ...job,
        teamId: team.id,
        startedAt: new Date(Date.now() - (index + 1) * 12 * 60 * 1000),
        completedAt:
          job.status === "RUNNING"
            ? null
            : new Date(Date.now() - (index + 1) * 9 * 60 * 1000),
      })),
    });

    await prisma.reconciliationRun.createMany({
      data: seed.reconciliations.map((run) => ({
        ...run,
        teamId: team.id,
      })),
    });
  }

  console.log("Seed completed for teams:", teamSeeds.map((team) => team.slug).join(", "));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
