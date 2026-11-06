import { cn } from "@/lib/utils";

/** The Alder mark: a leaf drawn from two arcs, with a midrib. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-6 shrink-0"
        fill="none"
      >
        <rect width="24" height="24" rx="6" className="fill-primary" />
        <path
          d="M12 4.5c3.6 2.7 5.4 5.6 5.4 8.4 0 3.3-2.4 5.6-5.4 6.6-3-1-5.4-3.3-5.4-6.6 0-2.8 1.8-5.7 5.4-8.4Z"
          className="fill-primary-foreground"
        />
        <path
          d="M12 8.5v11"
          className="stroke-primary"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight">Alder</span>
    </span>
  );
}
