import { Send } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CommandMenu } from "./command-menu";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NavLinks, SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * The frame around every page: sidebar on desktop, drawer on mobile, and a top
 * bar with search, theme and the primary action. It reads no request data, so
 * it is part of the static shell and paints immediately.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Link
          href="/"
          className="flex h-14 items-center px-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Logo />
        </Link>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {/* The active link depends on the URL, which a static shell cannot know. */}
          <Suspense fallback={<NavLinks pathname={null} />}>
            <SidebarNav />
          </Suspense>
        </div>
        <div className="border-t border-sidebar-border p-2">
          <UserMenu />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-sm sm:px-6">
          <Suspense fallback={null}>
            <MobileNav />
          </Suspense>
          <Link href="/" className="mr-1 lg:hidden" aria-label="Alder home">
            <Logo className="[&>span]:hidden sm:[&>span]:inline" />
          </Link>
          <div className="flex-1">
            <CommandMenu />
          </div>
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/payments?new=payment">
              <Send aria-hidden="true" />
              <span className="hidden sm:inline">Send money</span>
              <span className="sr-only sm:hidden">Send money</span>
            </Link>
          </Button>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
