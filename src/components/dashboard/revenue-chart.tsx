"use client";

import { useSyncExternalStore } from "react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

type Point = {
  name: string;
  ar: number;
  ap: number;
  glVariance: number;
};

type RevenueChartProps = {
  data: Point[];
};

export function RevenueChart({ data }: RevenueChartProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <Card className="h-[340px]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-400)]">Cash Movement Pulse</p>
          <h3 className="font-display text-xl text-[var(--text-100)]">AR, AP, and GL trend</h3>
        </div>
      </div>
      <div className="h-[250px] w-full">
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="arGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="apGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="name" tick={{ fill: "#93a5b5", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: "#93a5b5", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f1f2d",
                  border: "1px solid rgba(148,163,184,0.2)",
                  borderRadius: "12px",
                  color: "#f8fafc",
                }}
                formatter={(value) => formatCurrency(Number(value))}
              />
              <Area
                type="monotone"
                dataKey="ar"
                stroke="#06b6d4"
                fill="url(#arGradient)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="ap"
                stroke="#f59e0b"
                fill="url(#apGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-800)]/45" />
        )}
      </div>
    </Card>
  );
}
