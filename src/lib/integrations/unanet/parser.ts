import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";

import { z } from "zod";

const unanetGlRowSchema = z.object({
  transaction_id: z.string().min(1),
  posting_date: z.string().min(1),
  account_number: z.string().min(1),
  debit: z.coerce.number().nonnegative(),
  credit: z.coerce.number().nonnegative(),
  department: z.string().optional(),
  class: z.string().optional(),
  location: z.string().optional(),
  memo: z.string().optional(),
});

export type UnanetGlRow = z.infer<typeof unanetGlRowSchema>;

export type ParsedUnanetFile = {
  rows: UnanetGlRow[];
  hash: string;
  controlTotal: number;
};

export function parseUnanetGlCsv(csvText: string): ParsedUnanetFile {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const rows = z.array(unanetGlRowSchema).parse(records);

  const hash = createHash("sha256").update(csvText).digest("hex");
  const controlTotal = rows.reduce(
    (sum, row) => sum + Math.abs(row.debit - row.credit),
    0,
  );

  return {
    rows,
    hash,
    controlTotal,
  };
}
