"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Cable, LayoutDashboard, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/integrations", label: "Integrations", icon: Cable },
  { href: "/dashboard/reconciliation", label: "Reconciliation", icon: Activity },
  { href: "/dashboard/security", label: "Security", icon: ShieldCheck },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-72 flex-col rounded-3xl border border-[var(--border-soft)] bg-[var(--surface-900)] p-5 shadow-[0_20px_50px_-35px_rgba(0,0,0,0.9)]">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[radial-gradient(circle_at_top_right,var(--brand-300),var(--brand-600))] text-lg font-black text-[var(--canvas-950)]">
          N
        </div>
        <div>
          <p className="font-display text-lg text-[var(--text-100)]">Nimbus Ledger</p>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-400)]">
            Finance Ops
          </p>
        </div>
      </div>

      <nav className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-[var(--surface-700)] text-[var(--text-100)]"
                  : "text-[var(--text-300)] hover:bg-[var(--surface-800)] hover:text-[var(--text-100)]",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-[var(--border-soft)] bg-[linear-gradient(140deg,rgba(6,31,47,0.7),rgba(5,19,29,0.8))] p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-400)]">SOC posture</p>
        <p className="mt-2 text-sm text-[var(--text-100)]">MFA enforced, scoped credentials, full audit capture.</p>
      </div>
    </aside>
  );
}
