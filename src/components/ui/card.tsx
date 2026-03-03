import { cn } from "@/lib/utils";

type CardProps = {
  className?: string;
  children: React.ReactNode;
};

export function Card({ className, children }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-900)] p-5 shadow-[0_20px_50px_-30px_rgba(4,12,24,0.8)]",
        className,
      )}
    >
      {children}
    </section>
  );
}
