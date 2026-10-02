export interface MonthlyBreakdownItem {
  month: string;
  monthKey?: string;
  income: number;
  outflow: number;
  net: number;
  closingBalance?: number;
  transactionCount?: number;
}

export interface WeeklyBreakdownItem {
  month: string;
  week: string;
  startDate: string;
  endDate: string;
  income: number;
  outflow: number;
  net: number;
  closingBalance?: number;
  transactionCount: number;
}

export interface RawTransactionForBreakdown {
  date: string;
  credit: number;
  debit: number;
  balance: number;
}

/**
 * Robust date parser supporting Nigerian, British, and ISO bank statement formats.
 * Sets time to 12:00:00 local time to prevent UTC/daylight shift errors.
 */
export function parseTxDate(raw: string): Date | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  // Strip leading day names: e.g. "Sunday, 01 March 2026" or "Sun, 01/03/2026"
  const stripped = text.replace(
    /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s*/i,
    ""
  ).trim();

  // 1. ISO format: "YYYY-MM-DD" or "YYYY/MM/DD" (with optional time)
  const isoMatch = stripped.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day, 12, 0, 0);
    }
  }

  // 2. Format: "01 March 2026" or "01-Mar-2026" or "01/Mar/2026"
  const dMmmY = stripped.match(/^(\d{1,2})[\s/-]?([A-Za-z]{3,9})[\s/-]?(\d{2,4})/);
  if (dMmmY) {
    const day = Number(dMmmY[1]);
    const monthStr = dMmmY[2];
    const yearNum = Number(dMmmY[3].length === 2 ? `20${dMmmY[3]}` : dMmmY[3]);
    const testDate = new Date(`${monthStr} ${day}, ${yearNum} 12:00:00`);
    if (!Number.isNaN(testDate.getTime())) {
      return new Date(testDate.getFullYear(), testDate.getMonth(), testDate.getDate(), 12, 0, 0);
    }
  }

  // 3. Format: "March 01, 2026" or "Mar 1 2026"
  const mmmDY = stripped.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})/);
  if (mmmDY) {
    const monthStr = mmmDY[1];
    const day = Number(mmmDY[2]);
    const yearNum = Number(mmmDY[3].length === 2 ? `20${mmmDY[3]}` : mmmDY[3]);
    const testDate = new Date(`${monthStr} ${day}, ${yearNum} 12:00:00`);
    if (!Number.isNaN(testDate.getTime())) {
      return new Date(testDate.getFullYear(), testDate.getMonth(), testDate.getDate(), 12, 0, 0);
    }
  }

  // 4. Format: "DD/MM/YYYY" or "DD-MM-YYYY" (standard Nigerian / British banking)
  const dmy = stripped.match(/^(\d{1,2})[\s/-](\d{1,2})[\s/-](\d{2,4})/);
  if (dmy) {
    const p1 = Number(dmy[1]);
    const p2 = Number(dmy[2]);
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);

    let day = p1;
    let month = p2 - 1;

    // If p2 > 12 and p1 <= 12, it's MM/DD/YYYY
    if (p2 > 12 && p1 <= 12) {
      day = p2;
      month = p1 - 1;
    }

    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day, 12, 0, 0);
    }
  }

  // Fallback
  const standard = new Date(stripped);
  if (!Number.isNaN(standard.getTime())) {
    return new Date(standard.getFullYear(), standard.getMonth(), standard.getDate(), 12, 0, 0);
  }

  return null;
}

/**
 * Computes monthly inflow, outflow, net movement, and closing balance.
 * Sorted chronologically.
 */
export function computeMonthlyBreakdown(
  transactions: RawTransactionForBreakdown[],
  openingBalance: number
): MonthlyBreakdownItem[] {
  type MonthAccumulator = {
    sortTimestamp: number;
    monthKey: string;
    month: string;
    income: number;
    outflow: number;
    net: number;
    closingBalance: number;
    transactionCount: number;
  };

  const map = new Map<string, MonthAccumulator>();
  let currentRunningBalance = openingBalance;

  // Process transactions in chronological order if possible
  const dated = transactions.map((tx) => ({
    tx,
    parsedDate: parseTxDate(tx.date),
  }));

  // Sort by date if dates exist
  const hasDates = dated.some((d) => d.parsedDate !== null);
  if (hasDates) {
    dated.sort((a, b) => {
      const ta = a.parsedDate ? a.parsedDate.getTime() : 0;
      const tb = b.parsedDate ? b.parsedDate.getTime() : 0;
      return ta - tb;
    });
  }

  dated.forEach(({ tx, parsedDate }) => {
    const monthKey =
      parsedDate && parsedDate.getTime() > 0
        ? `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`
        : "Unclassified";

    const label =
      parsedDate && parsedDate.getTime() > 0
        ? parsedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
        : "Full Scope";

    if (tx.balance !== 0 && !Number.isNaN(tx.balance)) {
      currentRunningBalance = tx.balance;
    } else {
      currentRunningBalance = currentRunningBalance + tx.credit - tx.debit;
    }

    const existing = map.get(monthKey) || {
      sortTimestamp: parsedDate ? parsedDate.getTime() : 0,
      monthKey,
      month: label,
      income: 0,
      outflow: 0,
      net: 0,
      closingBalance: currentRunningBalance,
      transactionCount: 0,
    };

    existing.income += tx.credit;
    existing.outflow += tx.debit;
    existing.net = existing.income - existing.outflow;
    existing.closingBalance = currentRunningBalance;
    existing.transactionCount += 1;

    map.set(monthKey, existing);
  });

  return Array.from(map.values())
    .sort((a, b) => a.sortTimestamp - b.sortTimestamp)
    .map((m) => ({
      month: m.month,
      monthKey: m.monthKey,
      income: m.income,
      outflow: m.outflow,
      net: m.net,
      closingBalance: m.closingBalance,
      transactionCount: m.transactionCount,
    }));
}

/**
 * Computes weekly inflow and outflow breakdowns following the Nigerian fintech
 * underwriting industry pattern:
 * In each month:
 *   - week 1: Days 1 - 7
 *   - week 2: Days 8 - 14
 *   - week 3: Days 15 - 21
 *   - week 4: Days 22 - end of month
 *
 * Guarantees that sum(week 1..4) in any month exactly equals that month's monthly inflow/outflow.
 */
export function computeWeeklyBreakdown(
  transactions: RawTransactionForBreakdown[],
  openingBalance: number
): WeeklyBreakdownItem[] {
  const datedTxs = transactions
    .map((tx) => ({
      tx,
      date: parseTxDate(tx.date),
    }))
    .filter((item) => item.date !== null) as { tx: RawTransactionForBreakdown; date: Date }[];

  if (datedTxs.length === 0) {
    const income = transactions.reduce((s, t) => s + t.credit, 0);
    const outflow = transactions.reduce((s, t) => s + t.debit, 0);
    return [
      {
        month: "Full Period",
        week: "week 1",
        startDate: "Period Start",
        endDate: "Period End",
        income,
        outflow,
        net: income - outflow,
        closingBalance: transactions[transactions.length - 1]?.balance || openingBalance,
        transactionCount: transactions.length,
      },
    ];
  }

  // Sort ascending by date
  datedTxs.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Group by Month Key: "YYYY-MM"
  type MonthGroup = {
    year: number;
    monthIndex: number; // 0-11
    monthLabel: string; // e.g. "March 2026"
    txs: { tx: RawTransactionForBreakdown; date: Date }[];
    maxDayInTxs: number;
  };

  const monthGroups = new Map<string, MonthGroup>();

  datedTxs.forEach((item) => {
    const year = item.date.getFullYear();
    const monthIndex = item.date.getMonth();
    const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const monthLabel = item.date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    if (!monthGroups.has(key)) {
      monthGroups.set(key, {
        year,
        monthIndex,
        monthLabel,
        txs: [],
        maxDayInTxs: 0,
      });
    }

    const group = monthGroups.get(key)!;
    group.txs.push(item);
    if (item.date.getDate() > group.maxDayInTxs) {
      group.maxDayInTxs = item.date.getDate();
    }
  });

  const sortedMonthKeys = Array.from(monthGroups.keys()).sort();
  const results: WeeklyBreakdownItem[] = [];
  let runningBalance = openingBalance;

  sortedMonthKeys.forEach((monthKey, mIdx) => {
    const group = monthGroups.get(monthKey)!;
    const isLastMonth = mIdx === sortedMonthKeys.length - 1;

    // Number of days in this month
    const daysInMonth = new Date(group.year, group.monthIndex + 1, 0).getDate();

    // Determine how many weeks to render for this month:
    // If it's the last month, render weeks up to the maximum day present.
    // Otherwise, all 4 weeks exist for full transacting months.
    let maxWeek = 4;
    if (isLastMonth) {
      if (group.maxDayInTxs <= 7) maxWeek = 1;
      else if (group.maxDayInTxs <= 14) maxWeek = 2;
      else if (group.maxDayInTxs <= 21) maxWeek = 3;
      else maxWeek = 4;
    }

    const weekRanges = [
      { weekName: "week 1", startDay: 1, endDay: 7 },
      { weekName: "week 2", startDay: 8, endDay: 14 },
      { weekName: "week 3", startDay: 15, endDay: 21 },
      { weekName: "week 4", startDay: 22, endDay: daysInMonth },
    ];

    for (let w = 0; w < maxWeek; w++) {
      const range = weekRanges[w];

      const weekTxs = group.txs.filter((item) => {
        const d = item.date.getDate();
        return d >= range.startDay && d <= range.endDay;
      });

      let weekIncome = 0;
      let weekOutflow = 0;

      weekTxs.forEach(({ tx }) => {
        weekIncome += tx.credit;
        weekOutflow += tx.debit;
        if (tx.balance !== 0 && !Number.isNaN(tx.balance)) {
          runningBalance = tx.balance;
        } else {
          runningBalance = runningBalance + tx.credit - tx.debit;
        }
      });

      const startD = new Date(group.year, group.monthIndex, range.startDay);
      const endD = new Date(group.year, group.monthIndex, Math.min(range.endDay, daysInMonth));

      const formatD = (d: Date) =>
        d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });

      results.push({
        month: group.monthLabel,
        week: range.weekName,
        startDate: formatD(startD),
        endDate: formatD(endD),
        income: weekIncome,
        outflow: weekOutflow,
        net: weekIncome - weekOutflow,
        closingBalance: runningBalance,
        transactionCount: weekTxs.length,
      });
    }
  });

  return results;
}

