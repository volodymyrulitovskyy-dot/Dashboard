import { Database, Link2, Table2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { getTeamContext } from "@/lib/auth/tenancy";
import {
  externalReferenceTables,
  netsuiteReferenceMappings,
} from "@/lib/data/mapping-blueprint";

const statusClassMap = {
  TBD: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  IN_PROGRESS: "border-sky-300/40 bg-sky-300/10 text-sky-100",
  READY: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
} as const;

export default async function MappingPage() {
  const context = await getTeamContext();

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start gap-3">
          <Link2 className="mt-1 h-6 w-6 text-[var(--brand-300)]" />
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-400)]">
              Mapping control
            </p>
            <h2 className="font-display text-2xl text-[var(--text-100)]">
              NetSuite Reference Mapping Matrix
            </h2>
            <p className="mt-2 max-w-4xl text-sm text-[var(--text-300)]">
              Team <span className="font-medium text-[var(--text-200)]">{context.activeTeamId}</span> uses this
              matrix to map NetSuite reference data to external tables. External table schemas are created as
              placeholders and can be finalized without changing integration workflow endpoints.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 text-[var(--brand-300)]">
          <Table2 className="h-5 w-5" />
          <h3 className="font-display text-xl text-[var(--text-100)]">Current mapping set</h3>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border-soft)]">
          <table className="min-w-full divide-y divide-[var(--border-soft)] text-sm">
            <thead className="bg-[var(--surface-800)] text-left text-[var(--text-300)]">
              <tr>
                <th className="px-3 py-2 font-medium">NetSuite dataset</th>
                <th className="px-3 py-2 font-medium">Record type</th>
                <th className="px-3 py-2 font-medium">Key fields</th>
                <th className="px-3 py-2 font-medium">External table</th>
                <th className="px-3 py-2 font-medium">External keys</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-soft)] bg-[var(--surface-900)] text-[var(--text-200)]">
              {netsuiteReferenceMappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td className="px-3 py-3 align-top">
                    <p className="font-medium text-[var(--text-100)]">{mapping.label}</p>
                    <p className="mt-1 text-xs text-[var(--text-400)]">{mapping.notes}</p>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <code className="rounded bg-[var(--surface-700)] px-2 py-1 text-xs">
                      {mapping.netsuiteRecordType}
                    </code>
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-[var(--text-300)]">
                    <p>{mapping.netsuiteKeyField}</p>
                    <p className="mt-1 text-[var(--text-400)]">{mapping.netsuiteDisplayField}</p>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <code className="rounded bg-[var(--surface-700)] px-2 py-1 text-xs">
                      {mapping.externalTableName}
                    </code>
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-[var(--text-300)]">
                    <p>{mapping.externalPrimaryKey}</p>
                    <p className="mt-1 text-[var(--text-400)]">{mapping.externalDisplayField}</p>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusClassMap[mapping.status]}`}
                    >
                      {mapping.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 text-[var(--accent-300)]">
          <Database className="h-5 w-5" />
          <h3 className="font-display text-xl text-[var(--text-100)]">External tables (TBD schema placeholders)</h3>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {externalReferenceTables.map((table) => (
            <div
              key={table.tableName}
              className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-800)] p-3"
            >
              <p className="font-medium text-[var(--text-100)]">{table.tableName}</p>
              <p className="mt-1 text-xs text-[var(--text-400)]">{table.purpose}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[var(--text-400)]">
                Required columns
              </p>
              <ul className="mt-2 space-y-1 text-xs text-[var(--text-300)]">
                {table.requiredColumns.map((column) => (
                  <li key={column}>
                    <code>{column}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
