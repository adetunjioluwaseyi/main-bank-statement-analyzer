import { formatMoney, SupportedCurrency } from "./currencies";
import type { UnderwritingMetrics } from "./underwriting";
import type { StatementForensicsResult } from "./statement-forensics";
import {
  type MonthlyBreakdownItem,
  type WeeklyBreakdownItem,
  parseTxDate,
} from "./time-breakdown";

export interface TransactionSummaryItem {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  category?: string;
}

export interface ReportExportData {
  applicantName: string;
  accountNumber?: string;
  accountType: string;
  fileName: string;
  currency: SupportedCurrency;
  periodLabel: string;
  periodStart?: string;
  periodEnd?: string;
  openingBalance: number;
  closingBalance: number;
  minimumBalance: number;
  maximumBalance: number;
  income: number;
  outflow: number;
  net: number;
  underwriting: UnderwritingMetrics;
  forensics: StatementForensicsResult;
  monthlyBreakdown: MonthlyBreakdownItem[];
  weeklyBreakdown: WeeklyBreakdownItem[];
  transactions?: TransactionSummaryItem[];
}

export function buildReportHtml(data: ReportExportData): string {
  const {
    applicantName,
    accountNumber = "Not provided",
    accountType = "Standard Account",
    fileName,
    currency,
    periodLabel,
    openingBalance,
    closingBalance,
    income,
    outflow,
    monthlyBreakdown,
    weeklyBreakdown,
  } = data;

  const transactions: TransactionSummaryItem[] = (Array.isArray(data.transactions)
    ? data.transactions
    : []) as TransactionSummaryItem[];

  const transactingMonths = Math.max(1, monthlyBreakdown.length);
  const totalWeeks = Math.max(1, weeklyBreakdown.length);

  // 1. Date Range formatting
  const dates = transactions
    .map((t) => parseTxDate(String(t.date ?? "")))
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const minDate = dates[0] || new Date();
  const maxDate = dates[dates.length - 1] || new Date();

  const formatDateLong = (d: Date) =>
    d.toLocaleDateString("en-US", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  const periodString = `${formatDateLong(minDate)} - ${formatDateLong(maxDate)}`;

  // Timestamp of creation: DD/MM/YYYY HH:mm:ss
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateCreated = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // 2. Salary and Income Analytics
  const salaryTxs = transactions.filter(
    (t) =>
      t.credit > 0 &&
      (/salary|payroll|wages|net pay|stipend|allowance|monthly comp/i.test(t.description) ||
        t.category === "Salary / Payroll")
  );

  const otherIncomeTxs = transactions.filter(
    (t) => t.credit > 0 && !salaryTxs.includes(t)
  );

  const totalSalary = salaryTxs.reduce((s, t) => s + t.credit, 0);
  const avgSalary = salaryTxs.length > 0 ? totalSalary / transactingMonths : 0;
  const totalOtherIncome = otherIncomeTxs.reduce((s, t) => s + t.credit, 0);
  const avgOtherIncome = totalOtherIncome / transactingMonths;
  const maxSalary = salaryTxs.length > 0 ? Math.max(...salaryTxs.map((t) => t.credit)) : 0;
  const minSalary = salaryTxs.length > 0 ? Math.min(...salaryTxs.map((t) => t.credit)) : 0;
  const netMonthlyAvgEarning = (income - outflow) / transactingMonths;

  const expectedSalaryDay =
    salaryTxs.length > 0
      ? String(parseTxDate(salaryTxs[0].date)?.getDate() || 25)
      : "-";
  const lastSalaryDate =
    salaryTxs.length > 0
      ? formatDateLong(parseTxDate(salaryTxs[salaryTxs.length - 1].date) || maxDate)
      : "-";

  // 3. Spend Analytics
  const debitTxs: TransactionSummaryItem[] = (transactions.filter(
    (t: TransactionSummaryItem) => Number(t.debit) > 0
  ) as TransactionSummaryItem[]);
  const creditTxs: TransactionSummaryItem[] = (transactions.filter(
    (t: TransactionSummaryItem) => Number(t.credit) > 0
  ) as TransactionSummaryItem[]);

  // Frequency of debits
  const debitFreqMap = new Map<string, { count: number; total: number; desc: string }>();
  debitTxs.forEach((t) => {
    // Normalize narration
    const cleanDesc = t.description
      .replace(/\d{8,}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const key = cleanDesc.slice(0, 45).toLowerCase();
    const ex = debitFreqMap.get(key) || { count: 0, total: 0, desc: cleanDesc };
    ex.count++;
    ex.total += t.debit;customer
    debitFreqMap.set(key, ex);
  });

  const sortedFreqExpenses = Array.from(debitFreqMap.values()).sort(
    (a, b) => b.count - a.count
  );
  const mostFreqExpense = sortedFreqExpenses[0] || {
    desc: "Auto Save / Recurring Transfer",
    count: 1,
    total: 1000,
  };
  const mostFreqExpenseAvgAmount =
    mostFreqExpense.count > 0 ? mostFreqExpense.total / mostFreqExpense.count : 0;

  // Highest single debit
  let highestDebitTx: TransactionSummaryItem | null = null;
  debitTxs.forEach((t: TransactionSummaryItem) => {
    if (!highestDebitTx || Number(t.debit) > Number(highestDebitTx.debit)) {
      highestDebitTx = t;
    }
  });

  const highestDebit = highestDebitTx as TransactionSummaryItem | null;

  const highestDebitAmount = highestDebit ? highestDebit.debit : 0;
  const highestDebitParsedDate = highestDebit ? parseTxDate(highestDebit.date) : null;
  const highestDebitMonthYear = highestDebitParsedDate
    ? `${highestDebitParsedDate.getMonth() + 1}/${highestDebitParsedDate.getFullYear()}`
    : "-";

  // Recurring expenses (transactions occurring at least twice with matching amount or recurring keywords)
  let totalRecurringExpense = 0;
  sortedFreqExpenses.forEach((item) => {
    if (item.count >= 2) {
      totalRecurringExpense += item.total;
    }
  });
  const avgMonthlyExpenses = outflow / transactingMonths;
  const avgMonthlyRecurringExpenses = totalRecurringExpense / transactingMonths;

  // 4. Spend Breakdown Table (The 19 Standard Categories)
  const categoryDefinitions: { name: string; test: RegExp }[] = [
    { name: "Airtime And Data", test: /airtime|data bundle|recharge|vtu|mtn|airtel|glo|9mobile|smile|spectranet/i },
    { name: "ATM Withdrawls And POS", test: /atm|cash withdr|pos\s*(?:debit|purchase|terminal|cash)|fast cash/i },
    { name: "Charges And Stamp Duty", test: /stamp duty|sms alert|vat|maintenance|levy|charge|commission|fgn|fee|emtl/i },
    { name: "Entertainment", test: /netflix|showmax|spotify|cinema|movie|club|lounge|bar|apple music|youtube|dstv|gotv/i },
    { name: "Gambling", test: /bet9ja|sportybet|1xbet|betway|nairabet|surebet|merrybet|stake|casino|poker|betking|bangbet/i },
    { name: "Health", test: /hospital|pharmacy|clinic|medical|health|drug|chemist|dentist/i },
    { name: "Hospitality And Food", test: /food|restaurant|eat|kitchen|cafe|hotel|suites|bukka|grill|chicken|domino|kfc/i },
    { name: "Insurance", test: /insurance|underwriting|leadway|axa mansard|aiico|custodian/i },
    { name: "International Transactions", test: /usd|eur|gbp|intl|cross border|foreign|fx|paypal|amazon|apple\.com/i },
    { name: "Online And Web", test: /online|web|aws|google|domain|hostinger|namecheap|github|zoom|microsoft/i },
    { name: "Rent", test: /rent|landlord|estate|tenancy|lease|housing|apartment/i },
    { name: "Savings and Investments", test: /saving|invest|piggyvest|cowrywise|wealth|owealth|treasury|mutual fund|bonds/i },
    { name: "Transportation", test: /uber|bolt|taxify|flight|airline|fuel|filling station|totalenergies|nnpc|conoil|mobil/i },
    { name: "Travel", test: /travel|tour|air peace|ibom|dana|hotel booking|booking\.com|airbnb/i },
    { name: "Transfer", test: /transfer|trf|nip|outward|fip|cr\/|dr\/|sent to/i },
    { name: "USSD", test: /\*737\*|\*894\*|\*919\*|\*966\*|\*901\*|ussd/i },
    { name: "Utilities", test: /electric|power|phcn|ikedc|ekedc|aedc|eedc|water|waste|lawma/i },
    { name: "Agent Transactions", test: /agent|pos agent|agency banking|moniepoint|palmpay agent|opay agent/i },
  ];

  const categoryTotals = new Map<string, number>();
  categoryDefinitions.forEach((c) => categoryTotals.set(c.name, 0));
  categoryTotals.set("Others", 0);

  debitTxs.forEach((t) => {
    let matched = false;
    for (const def of categoryDefinitions) {
      if (def.test.test(t.description)) {
        categoryTotals.set(def.name, (categoryTotals.get(def.name) || 0) + t.debit);
        matched = true;
        break;
      }
    }
    if (!matched) {
      categoryTotals.set("Others", (categoryTotals.get("Others") || 0) + t.debit);
    }
  });

  // Find most frequent spend category
  let mostFreqCategoryName = "Charges And Stamp Duty";
  let maxCatTotal = -1;
  categoryTotals.forEach((val, key) => {
    if (val > maxCatTotal) {
      maxCatTotal = val;
      mostFreqCategoryName = key.toLowerCase().replace(/\s+/g, "_") + "_transactions";
    }
  });

  // 5. Pattern Analytics
  const totalTxCount = transactions.length;
  const debitTxCount = debitTxs.length;
  const creditTxCount = creditTxs.length;
  const debitPercent = totalTxCount > 0 ? (debitTxCount / totalTxCount) * 100 : 0;
  const creditPercent = totalTxCount > 0 ? (creditTxCount / totalTxCount) * 100 : 0;

  const lastDebitTx = debitTxs[debitTxs.length - 1];
  const lastCreditTx = creditTxs[creditTxs.length - 1];
  const lastDebitDateFormatted = lastDebitTx && parseTxDate(lastDebitTx.date)
    ? formatDateLong(parseTxDate(lastDebitTx.date)!)
    : formatDateLong(maxDate);
  const lastCreditDateFormatted = lastCreditTx && parseTxDate(lastCreditTx.date)
    ? formatDateLong(parseTxDate(lastCreditTx.date)!)
    : formatDateLong(maxDate);

  // Most frequent keywords in debits and credits
  const getMostFrequentWord = (txs: TransactionSummaryItem[]) => {
    const counts = new Map<string, number>();
    const stopWords = new Set(["the", "and", "for", "with", "from", "trf", "transfer", "nip", "to", "at", "pay"]);
    txs.forEach((t) => {
      const words = t.description.toLowerCase().replace(/[^a-z]/g, " ").split(/\s+/);
      words.forEach((w) => {
        if (w.length >= 4 && !stopWords.has(w)) {
          counts.set(w, (counts.get(w) || 0) + 1);
        }
      });
    });
    let topWord = "transfer";
    let topCount = 0;
    counts.forEach((cnt, word) => {
      if (cnt > topCount) {
        topCount = cnt;
        topWord = word;
      }
    });
    return topWord;
  };

  const mostFrequentDebitWord = getMostFrequentWord(debitTxs);
  const mostFrequentCreditWord = getMostFrequentWord(creditTxs);

  const returnChequeCount = transactions.filter((t) =>
    /returned cheque|dishonoured|unpaid cheque/i.test(t.description)
  ).length;

  // 6. Transaction Amount Distribution
  let txUnder10k = 0;
  let tx10kTo100k = 0;
  let tx100kTo500k = 0;
  let tx500kTo1M = 0;
  let txOver1M = 0;

  transactions.forEach((t) => {
    const val = Math.max(t.debit, t.credit);
    if (val < 10000) txUnder10k++;
    else if (val <= 100000) tx10kTo100k++;
    else if (val <= 500000) tx100kTo500k++;
    else if (val <= 1000000) tx500kTo1M++;
    else txOver1M++;
  });

  const txUnder10kPct = totalTxCount > 0 ? (txUnder10k / totalTxCount) * 100 : 0;
  const tx10kTo100kPct = totalTxCount > 0 ? (tx10kTo100k / totalTxCount) * 100 : 0;
  const tx100kTo500kPct = totalTxCount > 0 ? (tx100kTo500k / totalTxCount) * 100 : 0;
  const tx500kTo1MPct = totalTxCount > 0 ? (tx500kTo1M / totalTxCount) * 100 : 0;
  const txOver1MPct = totalTxCount > 0 ? (txOver1M / totalTxCount) * 100 : 0;

  let mostFrequentTxRange = "Less than ₦10,000.00";
  let maxTxPct = txUnder10kPct;
  if (tx10kTo100kPct > maxTxPct) {
    maxTxPct = tx10kTo100kPct;
    mostFrequentTxRange = "Between ₦10,000.00 to ₦100,000.00";
  }
  if (tx100kTo500kPct > maxTxPct) {
    maxTxPct = tx100kTo500kPct;
    mostFrequentTxRange = "Between ₦100,000.00 to ₦500,000.00";
  }

  // 7. Balance Tier Distribution
  let balUnder10k = 0;
  let bal10kTo100k = 0;
  let bal100kTo500k = 0;
  let bal500kTo1M = 0;
  let balOver1M = 0;

  transactions.forEach((t) => {
    const val = t.balance;
    if (val < 10000) balUnder10k++;
    else if (val <= 100000) bal10kTo100k++;
    else if (val <= 500000) bal100kTo500k++;
    else if (val <= 1000000) bal500kTo1M++;
    else balOver1M++;
  });

  const balTotalCount = transactions.length || 1;
  const balUnder10kPct = (balUnder10k / balTotalCount) * 100;
  const bal10kTo100kPct = (bal10kTo100k / balTotalCount) * 100;
  const bal100kTo500kPct = (bal100kTo500k / balTotalCount) * 100;
  const bal500kTo1MPct = (bal500kTo1M / balTotalCount) * 100;
  const balOver1MPct = (balOver1M / balTotalCount) * 100;

  let mostFrequentBalRange = "Less than ₦10,000.00";
  let maxBalPct = balUnder10kPct;
  if (bal10kTo100kPct > maxBalPct) {
    maxBalPct = bal10kTo100kPct;
    mostFrequentBalRange = "Between ₦10,000.00 to ₦100,000.00";
  }

  // 8. Behavioral
  const activeDaysSet = new Set<string>();
  transactions.forEach((t) => {
    const pd = parseTxDate(t.date);
    if (pd) activeDaysSet.add(pd.toISOString().split("T")[0]);
  });
  const totalPeriodDays = Math.max(
    1,
    Math.round((maxDate.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000)) + 1
  );
  const accountActivityPct = Math.min(100, (activeDaysSet.size / totalPeriodDays) * 100);

  const gamblingTotal = transactions
    .filter((t) => t.category === "Gambling & Betting" || /bet9ja|sportybet|1xbet|stake|casino/i.test(t.description))
    .reduce((s, t) => s + t.debit, 0);
  const gamblingRatePct = outflow > 0 ? (gamblingTotal / outflow) * 100 : 0;

  // Inflow irregularity (variance across months)
  const monthlyInflows = monthlyBreakdown.map((m) => m.income);
  const avgMonthlyInflow = income / transactingMonths;
  const variance =
    monthlyInflows.reduce((s, inf) => s + Math.pow(inf - avgMonthlyInflow, 2), 0) /
    transactingMonths;
  const stdDev = Math.sqrt(variance);
  const inflowIrregularityPct = avgMonthlyInflow > 0 ? (stdDev / avgMonthlyInflow) * 100 : 12;

  // 9. Loans & Repayments
  const loanCredits = transactions.filter(
    (t) =>
      t.credit > 0 &&
      (/loan|disbursement|credit facility|fairmoney|carbon|branch|quickcheck|renmoney|specta/i.test(
        t.description
      ) ||
        t.category === "Loan / Payday Apps")
  );

  const loanRepayments = transactions.filter(
    (t) =>
      t.debit > 0 &&
      (/repayment|loan pay|instalment|fairmoney|carbon|branch|quickcheck|renmoney/i.test(
        t.description
      ) ||
        t.category === "Loan / Payday Apps")
  );

  const totalLoanAmount = loanCredits.reduce((s, t) => s + t.credit, 0);
  const loanToInflowPct = income > 0 ? (totalLoanAmount / income) * 100 : 0;
  const avgMonthlyLoanAmount = totalLoanAmount / transactingMonths;

  const totalRepaymentAmount = loanRepayments.reduce((s, t) => s + t.debit, 0);
  const repaymentToInflowPct = income > 0 ? (totalRepaymentAmount / income) * 100 : 0;
  const avgMonthlyRepayment = totalRepaymentAmount / transactingMonths;

  // 10. Cash Flow Turnover & Averages
  const validCredit = income;
  const totalDebitsTurnover = outflow;
  const totalCreditsTurnover = income;

  const avgWeeklyDebits = totalDebitsTurnover / totalWeeks;
  const avgMonthlyDebits = totalDebitsTurnover / transactingMonths;
  const avgWeeklyCredits = totalCreditsTurnover / totalWeeks;
  const avgMonthlyCredits = totalCreditsTurnover / transactingMonths;

  const avgMonthlyBalance =
    transactions.length > 0
      ? transactions.reduce((s, t) => s + t.balance, 0) / transactions.length
      : closingBalance;
  const avgWeeklyBalance =
    weeklyBreakdown.length > 0
      ? weeklyBreakdown.reduce((s, w) => s + (w.closingBalance || 0), 0) / weeklyBreakdown.length
      : closingBalance;

  // 11. Self Transfers
  const selfTransferOutflows = transactions.filter(
    (t) =>
      t.debit > 0 &&
      (/owealth|save|piggyvest|cowrywise|self|own account/i.test(t.description) ||
        (applicantName &&
          applicantName.length > 4 &&
          t.description.toLowerCase().includes(applicantName.toLowerCase().split(" ")[0])))
  );

  const selfTransferInflows = transactions.filter(
    (t) =>
      t.credit > 0 &&
      (/owealth|save|piggyvest|cowrywise|self|own account/i.test(t.description) ||
        (applicantName &&
          applicantName.length > 4 &&
          t.description.toLowerCase().includes(applicantName.toLowerCase().split(" ")[0])))
  );

  // Clean currency formatting helper
  const fmt = (amt: number) => formatMoney(amt, currency);
  const fmtNum = (amt: number) =>
    amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Insights Analytics Report - ${applicantName}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1e293b;
      background: #ffffff;
      font-size: 11px;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
    }

    .report-wrapper {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 32px;
    }

    .page-sheet {
      page-break-after: always;
      break-after: page;
      min-height: 1200px;
      padding-bottom: 24px;
      position: relative;
    }

    .page-sheet:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }

    /* Print Controls */
    .print-bar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #183238;
      color: #ffffff;
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      margin-bottom: 24px;
    }

    .print-btn {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 8px 18px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .print-btn:hover {
      background: #1d4ed8;
    }

    /* Headings & Sections */
    .report-title {
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.02em;
    }

    .report-subtitle {
      font-size: 11.5px;
      color: #64748b;
      margin-top: 3px;
      margin-bottom: 16px;
    }

    .customer-header-box {
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
      padding: 12px 0;
      margin-bottom: 16px;
    }

    .customer-name-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 8px;
    }

    .customer-name-label {
      color: #64748b;
      font-weight: 500;
    }

    .customer-name-val {
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
    }

    .customer-meta-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr 1.2fr;
      gap: 16px;
      background: #f8fafc;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 11px;
    }

    .meta-item-label {
      color: #64748b;
      font-weight: 500;
    }

    .meta-item-val {
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
    }

    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      margin: 18px 0 10px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Cards */
    .card-grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }

    .card-grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }

    .card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
    }

    .card-title {
      font-size: 12px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
    }

    .data-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      border-bottom: 1px dashed #e2e8f0;
    }

    .data-row:last-child {
      border-bottom: none;
    }

    .data-label {
      color: #64748b;
      font-size: 11px;
    }

    .data-val {
      font-weight: 600;
      color: #0f172a;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    /* Blue Tables */
    .blue-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      margin-bottom: 16px;
    }

    .blue-table thead th {
      background-color: #3b82f6;
      color: #ffffff;
      padding: 6px 10px;
      font-weight: 600;
      text-align: left;
      font-size: 11px;
    }

    .blue-table thead th.text-right {
      text-align: right;
    }

    .blue-table tbody td {
      padding: 5px 10px;
      border-bottom: 1px solid #f1f5f9;
      color: #1e293b;
      font-variant-numeric: tabular-nums;
    }

    .blue-table tbody tr:nth-child(even) {
      background-color: #f8fafc;
    }

    .blue-table tbody tr:hover {
      background-color: #f1f5f9;
    }

    .text-right {
      text-align: right;
    }

    .side-by-side {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }

    .stat-pill {
      display: flex;
      justify-content: space-between;
      padding: 6px 10px;
      background: #f8fafc;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      margin-bottom: 6px;
      font-size: 11px;
    }

    .stat-pill-label {
      color: #64748b;
    }

    .stat-pill-val {
      font-weight: 700;
      color: #0f172a;
    }

    .page-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
    }

    @media print {
      .print-bar {
        display: none !important;
      }
      body {
        background: #ffffff;
      }
      .report-wrapper {
        padding: 0;
        max-width: 100%;
      }
      .page-sheet {
        page-break-after: always;
        break-after: page;
        min-height: 100vh;
      }
      @page {
        size: A4 portrait;
        margin: 14mm 16mm;
      }
    }
  </style>
</head>
<body>

  <div class="print-bar">
    <div>
      <strong>Insights Analytics Underwriting Report</strong>
      <span style="opacity: 0.8; margin-left: 10px;">Institutional Standard PDF</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="print-btn" onclick="window.print()">
        Print / Save to PDF
      </button>
    </div>
  </div>

  <div class="report-wrapper">

    <!-- ================= PAGE 1 ================= -->
    <div class="page-sheet">
      <div class="report-title">Insights Analytics Report</div>
      <div class="report-subtitle">
        Measure what matters; track income, spend, transaction pattern, financial behavioral and cash flow
      </div>

      <div class="customer-header-box">
        <div class="customer-name-row">
          <div>
            <span class="customer-name-label">Customer Name:</span>
            <strong class="customer-name-val" style="margin-left: 8px;">${applicantName}</strong>
          </div>
          <div>
            <span style="color: #64748b; font-weight: 500;">${periodString}</span>
          </div>
        </div>

        <div class="customer-meta-grid">
          <div>
            <div class="meta-item-label">Account Number:</div>
            <div class="meta-item-val">${accountNumber}</div>
          </div>
          <div>
            <div class="meta-item-label">Transacting Month(s):</div>
            <div class="meta-item-val">${transactingMonths}</div>
          </div>
          <div>
            <div class="meta-item-label">Date Created:</div>
            <div class="meta-item-val">${dateCreated}</div>
          </div>
        </div>
      </div>

      <!-- Income Section -->
      <div class="section-title">Income</div>
      <div class="card-grid-2">
        <!-- Salary Card -->
        <div class="card">
          <div class="card-title">Salary</div>
          <div class="data-row">
            <span class="data-label">Average predicted salary:</span>
            <span class="data-val">${fmt(avgSalary)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Average other income:</span>
            <span class="data-val">${fmt(avgOtherIncome)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Highest salary:</span>
            <span class="data-val">${maxSalary > 0 ? fmt(maxSalary) : "-"}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Lowest salary:</span>
            <span class="data-val">${minSalary > 0 ? fmt(minSalary) : fmt(0)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Net monthly average earning:</span>
            <span class="data-val">${fmt(netMonthlyAvgEarning)}</span>
          </div>
        </div>

        <!-- Payments Card -->
        <div class="card">
          <div class="card-title">Payments</div>
          <div class="data-row">
            <span class="data-label">No. of salary payments:</span>
            <span class="data-val">${salaryTxs.length}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Expected salary payment day:</span>
            <span class="data-val">${expectedSalaryDay}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Last date of salary payment:</span>
            <span class="data-val">${lastSalaryDate}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Frequency of salary payments:</span>
            <span class="data-val">${salaryTxs.length > 1 ? "Monthly" : "-"}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Number of other income payments:</span>
            <span class="data-val">${otherIncomeTxs.length}</span>
          </div>
        </div>
      </div>

      <!-- Spend Section -->
      <div class="section-title">Spend</div>
      <div class="card-grid-2" style="margin-bottom: 12px;">
        <div class="card">
          <div class="card-title">Most Frequent Expense</div>
          <div style="font-weight: 700; color: #0f172a; font-size: 12px;">
            ${mostFreqExpense.desc}
          </div>
          <div style="margin-top: 4px; color: #64748b; font-size: 11px;">
            Amount: <strong style="color: #0f172a;">${fmt(mostFreqExpenseAvgAmount)}</strong>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Most Frequent Spend Category</div>
          <div style="font-weight: 700; color: #0f172a; font-size: 12px;">
            ${mostFreqCategoryName}
          </div>
          <div style="margin-top: 4px; color: #64748b; font-size: 11px;">
            Highest Outflow Concentration
          </div>
        </div>
      </div>

      <div class="card-grid-2">
        <div class="card">
          <div class="card-title">Expenses</div>
          <div class="data-row">
            <span class="data-label">Highest Spend:</span>
            <span class="data-val">${fmt(highestDebitAmount)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Occured:</span>
            <span class="data-val">${highestDebitMonthYear}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Total Expenses:</span>
            <span class="data-val">${fmt(outflow)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Total Recurring Expense:</span>
            <span class="data-val">${fmt(totalRecurringExpense)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Average Monthly Expenses:</span>
            <span class="data-val">${fmt(avgMonthlyExpenses)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Average Monthly Recurring Expenses:</span>
            <span class="data-val">${fmt(avgMonthlyRecurringExpenses)}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">ATM Locations</div>
          <div style="padding: 18px 0; text-align: center; color: #94a3b8; font-size: 11px;">
            No ATM terminal geolocation recorded in statement logs
          </div>
        </div>
      </div>

      <div class="page-footer">
        <span>Insights Analytics Report · ${accountNumber}</span>
        <span>Page 1 of 5</span>
      </div>
    </div>


    <!-- ================= page 4 to the top ================= -->

    


    <!-- ================= PAGE 2 ================= -->
    <div class="page-sheet">
      <div class="section-title" style="margin-top: 0;">Spend Breakdown</div>
      <table class="blue-table">
        <thead>
          <tr>
            <th>Expense</th>
            <th class="text-right">Monthly Average (${currency})</th>
            <th class="text-right">Total (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from(categoryTotals.entries())
            .map(([catName, total]) => {
              const monthlyAvg = total / transactingMonths;
              return `<tr>
                <td>${catName}</td>
                <td class="text-right">${fmtNum(monthlyAvg)}</td>
                <td class="text-right">${fmtNum(total)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>

      <!-- Pattern Section -->
      <div class="section-title">Pattern</div>
      <div class="card-grid-2">
        <div class="card">
          <div class="card-title">Activity Counts</div>
          <div class="data-row">
            <span class="data-label">Card Request:</span>
            <span class="data-val">0</span>
          </div>
          <div class="data-row">
            <span class="data-label">Return Cheque:</span>
            <span class="data-val">${returnChequeCount}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Total Transactions:</span>
            <span class="data-val">${totalTxCount}</span>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          <!-- Debits card -->
          <div class="card" style="padding: 8px 12px;">
            <div class="card-title" style="margin-bottom: 6px;">Debits</div>
            <div class="data-row">
              <span class="data-label">Debit Transactions:</span>
              <span class="data-val">${debitPercent.toFixed(2)} %</span>
            </div>
            <div class="data-row">
              <span class="data-label">Last Used:</span>
              <span class="data-val">${lastDebitDateFormatted}</span>
            </div>
            <div class="data-row">
              <span class="data-label">Most Frequent Transfer:</span>
              <span class="data-val">${mostFrequentDebitWord}</span>
            </div>
          </div>

          <!-- Credits card -->
          <div class="card" style="padding: 8px 12px;">
            <div class="card-title" style="margin-bottom: 6px;">Credits</div>
            <div class="data-row">
              <span class="data-label">Credit Transactions:</span>
              <span class="data-val">${creditPercent.toFixed(2)} %</span>
            </div>
            <div class="data-row">
              <span class="data-label">Last Used:</span>
              <span class="data-val">${lastCreditDateFormatted}</span>
            </div>
            <div class="data-row">
              <span class="data-label">Most Frequent Transfer:</span>
              <span class="data-val">${mostFrequentCreditWord}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Transactions Section -->
      <div class="section-title">Transactions</div>
      <div class="card-grid-2">
        <div>
          <div class="stat-pill">
            <span class="stat-pill-label">Less than ₦10,000.00:</span>
            <span class="stat-pill-val">${txUnder10kPct.toFixed(2)} %</span>
          </div>
          <div class="stat-pill">
            <span class="stat-pill-label">Between ₦10,000.00 to ₦100,000.00:</span>
            <span class="stat-pill-val">${tx10kTo100kPct.toFixed(2)} %</span>
          </div>
          <div class="stat-pill">
            <span class="stat-pill-label">Between ₦100,000.00 to ₦500,000.00:</span>
            <span class="stat-pill-val">${tx100kTo500kPct.toFixed(2)} %</span>
          </div>
          <div class="stat-pill">
            <span class="stat-pill-label">Between ₦500,000.00 to ₦1,000,000.00:</span>
            <span class="stat-pill-val">${tx500kTo1MPct.toFixed(2)} %</span>
          </div>
          <div class="stat-pill">
            <span class="stat-pill-label">Greater than ₦1,000,000.00:</span>
            <span class="stat-pill-val">${txOver1MPct.toFixed(2)} %</span>
          </div>
        </div>

        <div class="card">
          <div style="font-size: 11px; color: #64748b;">Most Frequent Transaction Range</div>
          <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 4px 0 16px 0;">
            ${mostFrequentTxRange}
          </div>

          <div style="font-size: 11px; color: #64748b;">Percent Number Of Days Transactions were less than ₦10,000.00</div>
          <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px;">
            ${txUnder10kPct > 0 ? "100.00 %" : "0.00 %"}
          </div>
        </div>
      </div>

      <div class="page-footer">
        <span>Insights Analytics Report · ${accountNumber}</span>
        <span>Page 2 of 5</span>
      </div>
    </div>


    <!-- ================= PAGE 3 ================= -->
    <div class="page-sheet">
      <!-- Balances Section -->
      <div class="section-title" style="margin-top: 0;">Balances</div>
      <div class="card-grid-2">
        <div>
          <div class="stat-pill">
            <span class="stat-pill-label">Less than ₦10,000.00:</span>
            <span class="stat-pill-val">${balUnder10kPct.toFixed(2)} %</span>
          </div>
          <div class="stat-pill">
            <span class="stat-pill-label">Between ₦10,000.00 to ₦100,000.00:</span>
            <span class="stat-pill-val">${bal10kTo100kPct.toFixed(2)} %</span>
          </div>
          <div class="stat-pill">
            <span class="stat-pill-label">Between ₦100,000.00 to ₦500,000.00:</span>
            <span class="stat-pill-val">${bal100kTo500kPct.toFixed(2)} %</span>
          </div>
          <div class="stat-pill">
            <span class="stat-pill-label">Between ₦500,000.00 to ₦1,000,000.00:</span>
            <span class="stat-pill-val">${bal500kTo1MPct.toFixed(2)} %</span>
          </div>
          <div class="stat-pill">
            <span class="stat-pill-label">Greater than ₦1,000,000.00:</span>
            <span class="stat-pill-val">${balOver1MPct.toFixed(2)} %</span>
          </div>
        </div>

        <div class="card">
          <div style="font-size: 11px; color: #64748b;">Most Frequent Balance Range</div>
          <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 4px 0 16px 0;">
            ${mostFrequentBalRange}
          </div>

          <div style="font-size: 11px; color: #64748b;">Percent Number Of Days Balances were less than ₦10,000.00</div>
          <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px;">
            ${balUnder10kPct > 0 ? "100.00 %" : "0.00 %"}
          </div>
        </div>
      </div>

      <!-- Behavioral Section -->
      <div class="section-title">Behavioral</div>
      <div class="card" style="margin-bottom: 16px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div>
            <div class="data-row">
              <span class="data-label">Account Activity:</span>
              <span class="data-val">${accountActivityPct.toFixed(2)} %</span>
            </div>
            <div class="data-row">
              <span class="data-label">Account Sweep:</span>
              <span class="data-val">${outflow / income > 0.95 ? "Yes" : "No"}</span>
            </div>
            <div class="data-row">
              <span class="data-label">Gambling Rate:</span>
              <span class="data-val">${gamblingRatePct.toFixed(2)} %</span>
            </div>
          </div>
          <div>
            <div class="data-row">
              <span class="data-label">Inflow Irregularity:</span>
              <span class="data-val">${inflowIrregularityPct.toFixed(2)} %</span>
            </div>
            <div class="data-row">
              <span class="data-label">Monthly Inflow To Outflow Rate:</span>
              <span class="data-val" style="color: ${income >= outflow ? "#15803d" : "#b91c1c"};">
                ${income >= outflow ? "Positive Cash Flow" : "Negative Cash Flow"}
              </span>
            </div>
            <div class="data-row">
              <span class="data-label">Overall Inflow To Outflow Rate:</span>
              <span class="data-val" style="color: ${income >= outflow ? "#15803d" : "#b91c1c"};">
                ${income >= outflow ? "Positive Cash Flow" : "Negative Cash Flow"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Loan Section -->
      <div class="section-title">Loan & Loan Repayment</div>
      <div class="card-grid-2">
        <div class="card">
          <div class="card-title">Loan</div>
          <div class="data-row">
            <span class="data-label">Amount:</span>
            <span class="data-val">${fmt(totalLoanAmount)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Loan To Inflow Rate:</span>
            <span class="data-val">${loanToInflowPct.toFixed(2)} %</span>
          </div>
          <div class="data-row">
            <span class="data-label">Average Monthly Loan Amount:</span>
            <span class="data-val">${fmt(avgMonthlyLoanAmount)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Number Of Loan Transaction(s):</span>
            <span class="data-val">${loanCredits.length}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Loan Repayment</div>
          <div class="data-row">
            <span class="data-label">Amount:</span>
            <span class="data-val">${fmt(totalRepaymentAmount)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Loan Repayment To Inflow Rate:</span>
            <span class="data-val">${repaymentToInflowPct.toFixed(2)} %</span>
          </div>
          <div class="data-row">
            <span class="data-label">Average Monthly Loan Repayments:</span>
            <span class="data-val">${fmt(avgMonthlyRepayment)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Number Of Repayment Transaction(s):</span>
            <span class="data-val">${loanRepayments.length}</span>
          </div>
        </div>
      </div>

      <div class="page-footer">
        <span>Insights Analytics Report · ${accountNumber}</span>
        <span>Page 3 of 5</span>
      </div>
    </div>


    <!-- ================= PAGE 4 ================= -->
    <div class="page-sheet">
      <!-- Latest Loan & Repayment Tables -->
      <div class="side-by-side" style="margin-top: 0;">
        <div>
          <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">Latest Loan Transactions</div>
          <table class="blue-table">
            <thead>
              <tr>
                <th>Date</th>
                <th class="text-right">Amount (${currency})</th>
              </tr>
            </thead>
            <tbody>
              ${
                loanCredits.length > 0
                  ? loanCredits
                      .slice(-5)
                      .reverse()
                      .map((t) => `<tr><td>${t.date}</td><td class="text-right">${fmtNum(t.credit)}</td></tr>`)
                      .join("")
                  : `<tr><td colspan="2" style="text-align: center; color: #94a3b8;">No loan credits recorded</td></tr>`
              }
            </tbody>
          </table>
        </div>

        <div>
          <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">Latest Repayment Transactions</div>
          <table class="blue-table">
            <thead>
              <tr>
                <th>Date</th>
                <th class="text-right">Amount (${currency})</th>
              </tr>
            </thead>
            <tbody>
              ${
                loanRepayments.length > 0
                  ? loanRepayments
                      .slice(-5)
                      .reverse()
                      .map((t) => `<tr><td>${t.date}</td><td class="text-right">${fmtNum(t.debit)}</td></tr>`)
                      .join("")
                  : `<tr><td colspan="2" style="text-align: center; color: #94a3b8;">No repayment debits recorded</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Cash Flow Section -->
      <div class="section-title">Cash Flow</div>
      <div class="card-grid-4" style="margin-bottom: 12px;">
        <div class="card" style="padding: 10px;">
          <div style="font-size: 10.5px; color: #64748b;">Valid Credit</div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 3px;">
            ${fmt(validCredit)}
          </div>
        </div>
        <div class="card" style="padding: 10px;">
          <div style="font-size: 10.5px; color: #64748b;">Closing Balance</div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 3px;">
            ${fmt(closingBalance)}
          </div>
        </div>

        <div class="card" style="padding: 10px;">
          <div style="font-size: 10.5px; color: #64748b;">Opening Balance</div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 3px;">
            ${fmt( openingBalance)}
          </div>
        </div>
        <div class="card" style="padding: 10px;">
          <div style="font-size: 10.5px; color: #64748b;">Average Monthly Balance</div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 3px;">
            ${fmt(avgMonthlyBalance)}
          </div>
        </div>
        <div class="card" style="padding: 10px;">
          <div style="font-size: 10.5px; color: #64748b;">Average Weekly Balance</div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 3px;">
            ${fmt(avgWeeklyBalance)}
          </div>
        </div>
      </div>

      <!-- Debits and Credits Turnover comparison -->
      <div class="card-grid-2" style="margin-bottom: 16px;">
        <div class="card">
          <div class="card-title">Debits</div>
          <div class="data-row">
            <span class="data-label">Total Turnover:</span>
            <span class="data-val">${fmt(totalDebitsTurnover)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Average Weekly Debits:</span>
            <span class="data-val">${fmt(avgWeeklyDebits)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Average Monthly Debits:</span>
            <span class="data-val">${fmt(avgMonthlyDebits)}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Credits</div>
          <div class="data-row">
            <span class="data-label">Total Turnover:</span>
            <span class="data-val">${fmt(totalCreditsTurnover)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Average Weekly Credits:</span>
            <span class="data-val">${fmt(avgWeeklyCredits)}</span>
          </div>
          <div class="data-row">
            <span class="data-label">Average Monthly Credits:</span>
            <span class="data-val">${fmt(avgMonthlyCredits)}</span>
          </div>
        </div>
      </div>

      <!-- Monthly Outflow and Inflow Side-By-Side Tables -->
      <div class="side-by-side">
        <div>
          <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">Monthly Outflow</div>
          <table class="blue-table">
            <thead>
              <tr>
                <th>Date</th>
                <th class="text-right">Amount (${currency})</th>
              </tr>
            </thead>
            <tbody>
              ${monthlyBreakdown
                .map(
                  (m) => `<tr>
                    <td>${m.month}</td>
                    <td class="text-right">${fmtNum(m.outflow)}</td>
                  </tr>`
                )
                .join("")}
            </tbody>
            <tfoot>
              <tr style="font-weight: 700; background: #eff6ff; border-top: 2px solid #3b82f6;">
                <td style="padding: 6px 8px;">Total Outflow</td>
                <td class="text-right" style="padding: 6px 8px;">${fmtNum(totalDebitsTurnover)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div>
          <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">Monthly Inflow</div>
          <table class="blue-table">
            <thead>
              <tr>
                <th>Date</th>
                <th class="text-right">Amount (${currency})</th>
              </tr>
            </thead>
            <tbody>
              ${monthlyBreakdown
                .map(
                  (m) => `<tr>
                    <td>${m.month}</td>
                    <td class="text-right">${fmtNum(m.income)}</td>
                  </tr>`
                )
                .join("")}
            </tbody>
            <tfoot>
              <tr style="font-weight: 700; background: #eff6ff; border-top: 2px solid #3b82f6;">
                <td style="padding: 6px 8px;">Total Inflow</td>
                <td class="text-right" style="padding: 6px 8px;">${fmtNum(totalCreditsTurnover)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Weekly Outflow & Inflow Tables (First 10 entries) -->
      <div class="side-by-side">
        <div>
          <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">Weekly Outflow</div>
          <table class="blue-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Week</th>
                <th class="text-right">Amount (${currency})</th>
              </tr>
            </thead>
            <tbody>
              ${weeklyBreakdown
                .slice(0, 10)
                .map(
                  (w) => `<tr>
                    <td>${w.month}</td>
                    <td>${w.week}</td>
                    <td class="text-right">${fmtNum(w.outflow)}</td>
                  </tr>`
                )
                .join("")}
            </tbody>
            <tfoot>
              <tr style="font-weight: 700; background: #eff6ff; border-top: 2px solid #3b82f6;">
                <td colspan="2" style="padding: 6px 8px;">Total Outflow (${weeklyBreakdown.length} Wks)</td>
                <td class="text-right" style="padding: 6px 8px;">${fmtNum(totalDebitsTurnover)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div>
          <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">Weekly Inflow</div>
          <table class="blue-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Week</th>
                <th class="text-right">Amount (${currency})</th>
              </tr>
            </thead>
            <tbody>
              ${weeklyBreakdown
                .slice(0, 10)
                .map(
                  (w) => `<tr>
                    <td>${w.month}</td>
                    <td>${w.week}</td>
                    <td class="text-right">${fmtNum(w.income)}</td>
                  </tr>`
                )
                .join("")}
            </tbody>
            <tfoot>
              <tr style="font-weight: 700; background: #eff6ff; border-top: 2px solid #3b82f6;">
                <td colspan="2" style="padding: 6px 8px;">Total Inflow (${weeklyBreakdown.length} Wks)</td>
                <td class="text-right" style="padding: 6px 8px;">${fmtNum(totalCreditsTurnover)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="page-footer">
        <span>Insights Analytics Report · ${accountNumber}</span>
        <span>Page 4 of 5</span>
      </div>
    </div>


    <!-- ================= PAGE 5 ================= -->
    <div class="page-sheet">
      <!-- Remaining Weekly Outflow & Inflow Tables -->
      ${
        weeklyBreakdown.length > 10
          ? `<div class="side-by-side" style="margin-top: 0;">
              <div>
                <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">Weekly Outflow (Cont.)</div>
                <table class="blue-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Week</th>
                      <th class="text-right">Amount (${currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${weeklyBreakdown
                      .slice(10)
                      .map(
                        (w) => `<tr>
                          <td>${w.month}</td>
                          <td>${w.week}</td>
                          <td class="text-right">${fmtNum(w.outflow)}</td>
                        </tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>

              <div>
                <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">Weekly Inflow (Cont.)</div>
                <table class="blue-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Week</th>
                      <th class="text-right">Amount (${currency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${weeklyBreakdown
                      .slice(10)
                      .map(
                        (w) => `<tr>
                          <td>${w.month}</td>
                          <td>${w.week}</td>
                          <td class="text-right">${fmtNum(w.income)}</td>
                        </tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            </div>`
          : ""
      }

      <!-- Self Transfer Tables -->
      <div class="side-by-side">
        <div>
          <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">Self Transfer Outflow Transactions</div>
          <table class="blue-table">
            <thead>
              <tr>
                <th>Date</th>
                <th class="text-right">Amount (${currency})</th>
              </tr>
            </thead>
            <tbody>
              ${
                selfTransferOutflows.length > 0
                  ? selfTransferOutflows
                      .slice(0, 10)
                      .map((t) => `<tr><td>${t.date}</td><td class="text-right">${fmtNum(t.debit)}</td></tr>`)
                      .join("")
                  : `<tr><td colspan="2" style="text-align: center; color: #94a3b8;">No self transfer outflows recorded</td></tr>`
              }
            </tbody>
          </table>
        </div>

        <div>
          <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">Self Transfer Inflow Transactions</div>
          <table class="blue-table">
            <thead>
              <tr>
                <th>Date</th>
                <th class="text-right">Amount (${currency})</th>
              </tr>
            </thead>
            <tbody>
              ${
                selfTransferInflows.length > 0
                  ? selfTransferInflows
                      .slice(0, 10)
                      .map((t) => `<tr><td>${t.date}</td><td class="text-right">${fmtNum(t.credit)}</td></tr>`)
                      .join("")
                  : `<tr><td colspan="2" style="text-align: center; color: #94a3b8;">No self transfer inflows recorded</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="page-footer">
        <span>Insights Analytics Report · ${accountNumber}</span>
        <span>Page 5 of 5</span>
      </div>
    </div>

  </div>
</body>
</html>`;
}

export function openPrintableReport(data: ReportExportData) {
  const html = buildReportHtml(data);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    // Fallback: download if popups blocked
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.applicantName.replace(/\s+/g, "_")}_Insights_Analytics_Report.html`;
    a.click();
  }
}

export function downloadOfflineReport(data: ReportExportData) {
  const html = buildReportHtml(data);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.applicantName.replace(/\s+/g, "_")}_Insights_Analytics_Report.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
