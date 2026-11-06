import { Compass } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      description="That page does not exist, or it belongs to a different demo workspace."
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/">Back to overview</Link>
        </Button>
      }
    />
  );
}
