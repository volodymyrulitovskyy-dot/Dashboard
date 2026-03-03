import { Banknote, Cable, KeyRound, Upload } from "lucide-react";

import { IntegrationGrid } from "@/components/dashboard/integration-grid";
import { Card } from "@/components/ui/card";
import { getTeamContext } from "@/lib/auth/tenancy";
import { getIntegrationsByTeamRuntime } from "@/lib/data/runtime-data";

export default async function IntegrationsPage() {
  const context = await getTeamContext();
  const connections = await getIntegrationsByTeamRuntime(context.activeTeamId);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-400)]">Integration Fabric</p>
            <h2 className="font-display text-2xl text-[var(--text-100)]">System Connectivity</h2>
            <p className="mt-2 max-w-3xl text-sm text-[var(--text-300)]">
              This portal uses OAuth2 client credentials for Ramp, OAuth2 M2M with certificate for NetSuite,
              API-based pulls for Unanet and ADP, and automation workflows for reconciliation plus labor
              journal postings. Credentials remain outside source control and are referenced via secure secret storage.
            </p>
          </div>
        </div>
      </Card>

      <IntegrationGrid rows={connections} />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card>
          <div className="flex items-center gap-2 text-[var(--brand-300)]">
            <KeyRound className="h-5 w-5" />
            <p className="font-display text-lg text-[var(--text-100)]">Ramp OAuth2</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-300)]">
            <li>Client ID</li>
            <li>Client Secret</li>
            <li>Scopes: bills/vendors/transactions/receipts/reimbursements</li>
          </ul>
        </Card>

        <Card>
          <div className="flex items-center gap-2 text-[var(--brand-300)]">
            <Cable className="h-5 w-5" />
            <p className="font-display text-lg text-[var(--text-100)]">NetSuite M2M</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-300)]">
            <li>Account ID and Integration Client ID</li>
            <li>Certificate ID (kid) and private key (PEM)</li>
            <li>Scope: rest_webservices</li>
          </ul>
        </Card>

        <Card>
          <div className="flex items-center gap-2 text-[var(--brand-300)]">
            <Upload className="h-5 w-5" />
            <p className="font-display text-lg text-[var(--text-100)]">Unanet API</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-300)]">
            <li>OAuth2 client credentials or static API token</li>
            <li>Ledger totals endpoint returning AR/AP/GL balances</li>
            <li>Optional fallback to file-based import feed</li>
          </ul>
        </Card>

        <Card>
          <div className="flex items-center gap-2 text-[var(--brand-300)]">
            <Banknote className="h-5 w-5" />
            <p className="font-display text-lg text-[var(--text-100)]">ADP Payroll API</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-300)]">
            <li>Payroll gross wages by employee and period</li>
            <li>OAuth2 client credentials or static API token</li>
            <li>Feeds labor cost distribution JE automation</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
