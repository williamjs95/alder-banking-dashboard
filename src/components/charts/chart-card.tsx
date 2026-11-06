"use client";

import { ChartLine, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ChartTable = {
  /** Column headings; the first column is the row label. */
  columns: readonly string[];
  rows: readonly (readonly string[])[];
};

/**
 * The frame every chart sits in: a title, optional controls, and a switch to a
 * table of the same numbers. The table is the accessible twin of the chart, so
 * no value is reachable only by hovering or by telling colors apart.
 */
export function ChartCard({
  title,
  description,
  actions,
  table,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  table: ChartTable;
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const toggleLabel = showTable ? "Show chart" : "Show as table";

  return (
    <Card className={cn("gap-4 px-5 py-4 shadow-none", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          {description && (
            <div className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {actions}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={toggleLabel}
                aria-pressed={showTable}
                onClick={() => setShowTable((current) => !current)}
              >
                {showTable ? <ChartLine /> : <Table2 />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{toggleLabel}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {showTable ? (
        <div className="max-h-80 overflow-auto rounded-md border">
          <Table>
            <TableCaption className="sr-only">{title}</TableCaption>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                {table.columns.map((column, index) => (
                  <TableHead
                    key={column}
                    className={cn(index > 0 && "text-right")}
                  >
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row) => (
                <TableRow key={row[0]}>
                  {row.map((cell, index) => (
                    <TableCell
                      key={table.columns[index]}
                      className={cn(index > 0 && "tabular text-right")}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        children
      )}
    </Card>
  );
}
