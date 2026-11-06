"use client";

import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { Component, Suspense, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-client";

type Props = { children: ReactNode; onReset: () => void };
type State = { error: unknown };

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  retry = () => {
    this.props.onReset();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <div
        role="alert"
        className="flex flex-col items-center rounded-xl border bg-card px-6 py-12 text-center"
      >
        <TriangleAlert
          className="mb-3 size-6 text-destructive"
          aria-hidden="true"
        />
        <p className="text-sm font-medium">This section could not load</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {errorMessage(this.state.error)}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={this.retry}
        >
          Try again
        </Button>
      </div>
    );
  }
}

/**
 * Wraps a view that reads with `useSuspenseQuery`: shows `fallback` while it
 * loads and a retry panel if it fails, without taking the rest of the page down.
 */
export function QueryBoundary({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary onReset={reset}>
          <Suspense fallback={fallback}>{children}</Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
