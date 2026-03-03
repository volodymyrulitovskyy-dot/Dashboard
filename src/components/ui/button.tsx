import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--canvas-900)] disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "bg-[var(--brand-500)] text-white hover:bg-[var(--brand-400)] focus-visible:ring-[var(--brand-300)]",
        variant === "outline" &&
          "border border-[var(--border-strong)] bg-transparent text-[var(--text-100)] hover:bg-[var(--surface-800)] focus-visible:ring-[var(--brand-300)]",
        variant === "ghost" &&
          "bg-transparent text-[var(--text-300)] hover:bg-[var(--surface-800)] hover:text-[var(--text-100)] focus-visible:ring-[var(--brand-300)]",
        className,
      )}
      {...props}
    />
  );
}
