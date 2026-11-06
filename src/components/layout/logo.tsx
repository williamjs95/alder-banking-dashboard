import { cn } from "@/lib/utils";

/** The Alder mark: a white leaf on the purple of the cover, beside the name. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-6 shrink-0"
        fill="none"
      >
        <rect width="24" height="24" rx="6" className="fill-sidebar" />
        <path
          d="M12 4.5c3.6 2.7 5.4 5.6 5.4 8.4 0 3.3-2.4 5.6-5.4 6.6-3-1-5.4-3.3-5.4-6.6 0-2.8 1.8-5.7 5.4-8.4Z"
          className="fill-sidebar-marker"
        />
        <path
          d="M12 8.5v11"
          className="stroke-sidebar"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-display text-[19px] leading-none font-semibold">
        Alder
      </span>
    </span>
  );
}
