// SOW deadline math. HIVE tracks deliverables; it does not define them.
// Confirm against current Utah DSPD SOW.

export type DeadlineRow = {
  key: "fba" | "bsp" | "monthly_review" | "quarterly_graph" | "annual_report";
  label: string;
  dueAt: Date | null;
  overdueDays: number; // negative = upcoming
  status: "missing" | "ok" | "due_soon" | "overdue";
  note: string;
};

const DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / DAY);
}

export function computeDeadlines(opts: {
  fbaUploadedAt: string | null;
  bspUploadedAt: string | null;
  lastMonthlyReviewAt: string | null;
  lastDataEntryAt: string | null;
  bcConfigEnabledAt: string | null; // behavior_support_clients.created_at
  now?: Date;
}): DeadlineRow[] {
  const now = opts.now ?? new Date();
  const out: DeadlineRow[] = [];

  // FBA: due 30 days after BC config enabled (we treat enabled-at as the
  // "approval" anchor; provider can re-anchor by replacing the FBA)
  const fbaAnchor = opts.bcConfigEnabledAt ? new Date(opts.bcConfigEnabledAt) : null;
  if (opts.fbaUploadedAt) {
    out.push(rowOk("fba", "FBA on file", new Date(opts.fbaUploadedAt)));
  } else if (fbaAnchor) {
    const due = new Date(fbaAnchor.getTime() + 30 * DAY);
    out.push(makeRow("fba", "FBA due (30 days after enable)", due, now));
  } else {
    out.push({
      key: "fba", label: "FBA on file", dueAt: null, overdueDays: 0,
      status: "missing", note: "No FBA uploaded.",
    });
  }

  // BSP: due 30 days after FBA upload
  if (opts.bspUploadedAt) {
    out.push(rowOk("bsp", "BSP on file", new Date(opts.bspUploadedAt)));
  } else if (opts.fbaUploadedAt) {
    const due = new Date(new Date(opts.fbaUploadedAt).getTime() + 30 * DAY);
    out.push(makeRow("bsp", "BSP due (30 days after FBA)", due, now));
  } else {
    out.push({
      key: "bsp", label: "BSP on file", dueAt: null, overdueDays: 0,
      status: "missing", note: "No BSP uploaded.",
    });
  }

  // Monthly effectiveness review — 30 days since last
  {
    const anchor = opts.lastMonthlyReviewAt
      ? new Date(opts.lastMonthlyReviewAt)
      : opts.bspUploadedAt
        ? new Date(opts.bspUploadedAt)
        : null;
    if (anchor) {
      const due = new Date(anchor.getTime() + 30 * DAY);
      out.push(makeRow("monthly_review", "Monthly effectiveness review", due, now));
    } else {
      out.push({
        key: "monthly_review", label: "Monthly effectiveness review",
        dueAt: null, overdueDays: 0, status: "missing",
        note: "No monthly review on file yet.",
      });
    }
  }

  // Quarterly graphed data — 90 days since last data entry
  {
    const anchor = opts.lastDataEntryAt ? new Date(opts.lastDataEntryAt) : null;
    if (anchor) {
      const due = new Date(anchor.getTime() + 90 * DAY);
      out.push(makeRow("quarterly_graph", "Graphed data (every 3 months)", due, now));
    } else {
      out.push({
        key: "quarterly_graph", label: "Graphed data (every 3 months)",
        dueAt: null, overdueDays: 0, status: "missing",
        note: "No data entries logged yet.",
      });
    }
  }

  // Annual outcome report — Aug 30 of current year (next year if past)
  {
    const year = now.getMonth() > 7 || (now.getMonth() === 7 && now.getDate() > 30)
      ? now.getFullYear() + 1
      : now.getFullYear();
    const due = new Date(year, 7, 30); // month 7 = August
    out.push(makeRow("annual_report", `Annual outcome report (Aug 30, ${year})`, due, now));
  }

  return out;
}

function rowOk(key: DeadlineRow["key"], label: string, anchor: Date): DeadlineRow {
  return {
    key, label, dueAt: anchor, overdueDays: 0, status: "ok",
    note: `Recorded ${anchor.toLocaleDateString()}.`,
  };
}

function makeRow(
  key: DeadlineRow["key"], label: string, due: Date, now: Date,
): DeadlineRow {
  const diff = daysBetween(now, due);
  let status: DeadlineRow["status"];
  let note: string;
  if (diff < 0) {
    status = "overdue";
    note = `Overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"}.`;
  } else if (diff <= 7) {
    status = "due_soon";
    note = `Due in ${diff} day${diff === 1 ? "" : "s"}.`;
  } else {
    status = "ok";
    note = `Due in ${diff} days.`;
  }
  return { key, label, dueAt: due, overdueDays: -diff, status, note };
}
