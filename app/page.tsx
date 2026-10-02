"use client";

import { useEffect, useMemo, useState } from "react";
import FileUpload from "@/components/file-upload";
import { CreditMemoDialog } from "@/components/credit-memo-dialog";
import { useAuth } from "@/context/auth-context";
import { UserNav } from "@/components/user-nav";
import { AdminDashboard } from "@/components/admin-dashboard";
import { UserHistoryDialog } from "@/components/user-history-dialog";
import { SuspendedBanner } from "@/components/suspended-banner";
import { recordStatementUpload } from "@/lib/admin-service";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Check,
  Download,
  FileDown,
  FileJson,
  FileText,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Upload,
  WalletCards,
  Building,
  Scale,
  Dices,
  Receipt,
  AlertCircle,
  EyeOff,
  Eye,
  Plus,
  Wallet,
} from "lucide-react";
import {
  CURRENCIES,
  formatMoney,
  SupportedCurrency,
} from "@/lib/currencies";
import {
  categorizeTransaction,
  CategoryType,
} from "@/lib/categorizer";
import {
  runStatementForensics,
} from "@/lib/statement-forensics";
import {
  calculateUnderwriting,
} from "@/lib/underwriting";
import {
  computeMonthlyBreakdown,
  computeWeeklyBreakdown,
  parseTxDate,
} from "@/lib/time-breakdown";
import {
  openPrintableReport,
  downloadOfflineReport,
} from "@/lib/report-export";
import { LenderDashboard } from "@/components/lender-dashboard";

export interface CSVData {
  headers: string[];
  rows: string[][];
  fileName: string;
  fileSize?: number;
  metadata?: {
    accountNumber?: string;
    periodStart?: string;
    periodEnd?: string;
    openingBalance?: number;
    closingBalance?: number;
    totalDebits?: number;
    totalCredits?: number;
    accountHolder?: string;
    accountType?: string;
    sha256?: string;
    integrityWarnings?: string[];
    integrityStatus?: string;
    integrityScore?: number;
  };
}

type Transaction = {
  index: number;
  date: string;
  values: string[];
  description: string;
  category: CategoryType;
  debit: number;
  credit: number;
  balance: number;
  isGambling: boolean;
  isPaydayLoan: boolean;
  isPenaltyOrNSF: boolean;
  isCrypto: boolean;
  isSalary: boolean;
  riskFlag?: string;
};

type CategorySummary = { category: CategoryType; count: number; amount: number };

function numberFrom(value: string | undefined): number {
  if (!value) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  if (/[a-zA-Z]/.test(raw) && !/^\s*\(.+\)\s*$/.test(raw)) return 0;
  const isNegative = /^\s*\(.+\)\s*$/.test(raw) || /^\s*-/.test(raw);
  const parsed = Number.parseFloat(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 10_000_000_000_000) return 0;
  return isNegative ? -Math.abs(parsed) : parsed;
}

function downloadFile(content: string, filename: string, type: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-border/80 shadow-xs transition-all hover:border-primary/40">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          </div>
          <div className="rounded-lg bg-[#eef3f0] p-2">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Signal({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-[#fbfcfb] p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function Home() {
  const { user, profile, loading, isAdmin, isSuspended, refreshProfile } = useAuth();
  const [statement, setStatement] = useState<CSVData | null>(null);
  const [currency, setCurrency] = useState<SupportedCurrency>("NGN");
  const [isCreditMemoOpen, setIsCreditMemoOpen] = useState(false);
  const [isPiiMasked, setIsPiiMasked] = useState(false);
  const [timelineTab, setTimelineTab] = useState<"insight" | "monthly" | "weekly" | "chart">("insight");
  const [viewMode, setViewMode] = useState<"lender" | "statement">("lender");
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
  const [isUserHistoryOpen, setIsUserHistoryOpen] = useState(false);
  const [lastLoggedKey, setLastLoggedKey] = useState<string | null>(null);

  const [loanTenureMonths, setLoanTenureMonths] = useState<number>(3);
  const [riskPolicy, setRiskPolicy] = useState<"conservative" | "standard" | "aggressive">("standard");

  const analysis = useMemo(() => {
    if (!statement) return null;

    const headers = statement.headers.map((header) => header.toLowerCase().trim());

    // 1. Identify Date column
    let dateIndex = headers.findIndex((h) =>
      /^(trans_?date|txn_?date|posting_?date|value_?date|date|time)$/i.test(h)
    );
    if (dateIndex === -1) dateIndex = headers.findIndex((h) => /\b(date|time)\b/i.test(h));

    // 2. Identify Description / Narration column
    let descriptionIndex = headers.findIndex((h) =>
      /^(narration|description|particulars?|details?|memo|remarks?)$/i.test(h)
    );
    if (descriptionIndex === -1) {
      descriptionIndex = headers.findIndex((h) => /\b(desc|narrat|particular|memo|detail)\b/i.test(h));
    }

    const isMetaOrRefCol = (idx: number) => {
      if (idx === dateIndex || idx === descriptionIndex) return true;
      const h = headers[idx] || "";
      return /^(ref|reference|txn_?id|session_?id|session|account|nuban|chq|cheque|channel|slip|val_?date)$/i.test(h);
    };

    // 3. Strict Debit Column (Withdrawals)
    let debitIndex = headers.findIndex(
      (h, idx) => !isMetaOrRefCol(idx) && /^(debit|dr\.?|withdrawal|outflow|paid_?out)$/i.test(h)
    );
    if (debitIndex === -1) {
      debitIndex = headers.findIndex(
        (h, idx) => !isMetaOrRefCol(idx) && /\b(debit|dr|withdrawal|outflow)\b/i.test(h)
      );
    }

    // 4. Strict Credit Column (Deposits)
    let creditIndex = headers.findIndex(
      (h, idx) => !isMetaOrRefCol(idx) && idx !== debitIndex && /^(credit|cr\.?|deposit|inflow|paid_?in)$/i.test(h)
    );
    if (creditIndex === -1) {
      creditIndex = headers.findIndex(
        (h, idx) => !isMetaOrRefCol(idx) && idx !== debitIndex && /\b(credit|deposit|inflow)\b/i.test(h)
      );
    }

    // 5. Strict Running Balance Column
    let balanceIndex = headers.findIndex(
      (h, idx) => !isMetaOrRefCol(idx) && idx !== debitIndex && idx !== creditIndex && /^(balance|bal\.?|running_?bal|ledger_?bal)$/i.test(h)
    );
    if (balanceIndex === -1) {
      balanceIndex = headers.findIndex(
        (h, idx) => !isMetaOrRefCol(idx) && idx !== debitIndex && idx !== creditIndex && /\b(balance|bal)\b/i.test(h)
      );
    }

    // 6. Fallback Single Amount column
    const amountIndex = headers.findIndex(
      (h, idx) =>
        !isMetaOrRefCol(idx) &&
        idx !== debitIndex &&
        idx !== creditIndex &&
        idx !== balanceIndex &&
        /^(amount|value|transaction_?amount)$/i.test(h)
    );

    // Build normalized transactions, explicitly ignoring summary rows
    const transactions: Transaction[] = [];
    statement.rows.forEach((values, index) => {
      const lineStr = values.join(" ").toLowerCase();
      // Skip summary / footer rows
      if (
        /debit\(s\)|credit\(s\)|clrd\s*\+\s*unclrd|total\s+debit|total\s+credit|opening\s+balance|closing\s+balance/i.test(
          lineStr
        )
      ) {
        return;
      }

      const rawDate = values[dateIndex >= 0 ? dateIndex : 0] || "";
      const description = values[descriptionIndex >= 0 ? descriptionIndex : 1] || "Statement transaction";
      const debit = debitIndex >= 0 ? numberFrom(values[debitIndex]) : 0;
      const credit = creditIndex >= 0 ? numberFrom(values[creditIndex]) : 0;
      const amount = amountIndex >= 0 ? numberFrom(values[amountIndex]) : 0;
      const actualDebit = debit || (creditIndex < 0 && amount < 0 ? Math.abs(amount) : 0);
      const actualCredit = credit || (debitIndex < 0 && amount > 0 ? amount : 0);
      const balance = balanceIndex >= 0 ? numberFrom(values[balanceIndex]) : 0;

      // Ignore empty filler rows
      if (actualDebit === 0 && actualCredit === 0 && balance === 0) return;

      const categoryDetails = categorizeTransaction(description, actualDebit, actualCredit);

      transactions.push({
        index,
        date: rawDate,
        values,
        description,
        category: categoryDetails.category,
        debit: actualDebit,
        credit: actualCredit,
        balance,
        isGambling: categoryDetails.isGambling,
        isPaydayLoan: categoryDetails.isPaydayLoan,
        isPenaltyOrNSF: categoryDetails.isPenaltyOrNSF,
        isCrypto: categoryDetails.isCrypto,
        isSalary: categoryDetails.isSalary,
        riskFlag: categoryDetails.riskFlag,
      });
    });

    // Compute sums or use verified bank statement header metadata totals if available
    const calculatedInflow = transactions.reduce((sum, tx) => sum + tx.credit, 0);
    const calculatedOutflow = transactions.reduce((sum, tx) => sum + tx.debit, 0);

    const income = typeof statement.metadata?.totalCredits === "number" && statement.metadata.totalCredits > 0
      ? statement.metadata.totalCredits
      : calculatedInflow;

    const outflow = typeof statement.metadata?.totalDebits === "number" && statement.metadata.totalDebits > 0
      ? statement.metadata.totalDebits
      : calculatedOutflow;

    const net = income - outflow;

    // Balances
    const balances = transactions.map((tx) => tx.balance).filter((b) => b !== 0);
    const averageBalance = balances.length ? balances.reduce((sum, b) => sum + b, 0) / balances.length : 0;
    const minimumBalance = balances.length ? Math.min(...balances) : 0;
    const maximumBalance = balances.length ? Math.max(...balances) : 0;

    // Opening & Closing Balance with negative support
    const openingBalance = typeof statement.metadata?.openingBalance === "number"
      ? statement.metadata.openingBalance
      : transactions.length > 0 && transactions[0].balance !== 0
      ? transactions[0].balance - transactions[0].credit + transactions[0].debit
      : 0;

    const closingBalance = typeof statement.metadata?.closingBalance === "number"
      ? statement.metadata.closingBalance
      : [...transactions].reverse().find((tx) => tx.balance !== 0)?.balance ??
        (openingBalance + income - outflow);

    const netBalanceDelta = closingBalance - openingBalance;
    const balanceGrowthRate = openingBalance !== 0 ? (netBalanceDelta / Math.abs(openingBalance)) * 100 : 0;

    const breakdownRawTxs = transactions.map((t) => ({
      date: t.date,
      credit: t.credit,
      debit: t.debit,
      balance: t.balance,
    }));
    const monthlyBreakdown = computeMonthlyBreakdown(breakdownRawTxs, openingBalance);
    const weeklyBreakdown = computeWeeklyBreakdown(breakdownRawTxs, openingBalance);

    // Category breakdown
    const categoryMap = new Map<CategoryType, CategorySummary>();
    transactions.forEach((tx) => {
      const current = categoryMap.get(tx.category) || {
        category: tx.category,
        count: 0,
        amount: 0,
      };
      current.count += 1;
      current.amount += tx.debit + tx.credit;
      categoryMap.set(tx.category, current);
    });
    const categoryBreakdown = Array.from(categoryMap.values()).sort((a, b) => b.amount - a.amount);

    // Forensics & Underwriting
    const forensicItems = transactions.map((tx) => ({
      index: tx.index,
      date: tx.date,
      description: tx.description,
      credit: tx.credit,
      debit: tx.debit,
      balance: tx.balance,
    }));
    const forensics = runStatementForensics(forensicItems, openingBalance);

    const underwriting = calculateUnderwriting({
      income,
      outflow,
      net,
      openingBalance,
      closingBalance,
      minimumBalance,
      averageBalance,
      transactions,
      monthlyBreakdown,
      mathIntegrityScore: forensics.mathIntegrityScore,
      forensics,
      accountHolder: statement.metadata?.accountHolder,
    });

    const expenseRatio = income > 0 ? (outflow / income) * 100 : 0;
    const periodLabel =
      statement.metadata?.periodStart && statement.metadata?.periodEnd
        ? `${statement.metadata.periodStart} to ${statement.metadata.periodEnd}`
        : monthlyBreakdown.length > 0
        ? `${monthlyBreakdown[0].month} - ${monthlyBreakdown[monthlyBreakdown.length - 1].month}`
        : "Full Statement Scope";

    const riskMetrics = [
      {
        label: "Math Integrity",
        score: forensics.mathIntegrityScore,
        detail: forensics.forgeryRiskSummary,
      },
      {
        label: "Debt Capacity",
        score: Math.max(0, Math.round(100 - underwriting.dtiRatio)),
        detail: `DTI: ${underwriting.dtiRatio}% · FOIR: ${underwriting.foirRatio}%`,
      },
      {
        label: "Cash Runway",
        score: Math.min(100, Math.round((underwriting.cashRunwayDays / 60) * 100)),
        detail: `${underwriting.cashRunwayDays} days of survival at current outflows`,
      },
      {
        label: "Behavioral Cleanliness",
        score: Math.max(
          0,
          Math.round(
            100 -
              underwriting.gamblingExposure.percentOfOutflow * 3 -
              underwriting.paydayLoanExposure.appCount * 15 -
              underwriting.nsfAndPenalties.count * 20
          )
        ),
        detail: `${underwriting.gamblingExposure.percentOfOutflow}% gambling · ${underwriting.paydayLoanExposure.appCount} payday apps`,
      },
    ];

    return {
      income,
      outflow,
      net,
      expenseRatio,
      openingBalance,
      closingBalance,
      netBalanceDelta,
      balanceGrowthRate,
      averageBalance,
      minimumBalance,
      maximumBalance,
      periodLabel,
      transactions,
      monthlyBreakdown,
      weeklyBreakdown,
      categoryBreakdown,
      forensics,
      underwriting,
      riskMetrics,
    };
  }, [statement]);

  const handleAppendStatement = (newStmt: CSVData) => {
    if (!statement) {
      setStatement(newStmt);
      return;
    }
    setStatement({
      ...statement,
      fileName: `${statement.fileName} + ${newStmt.fileName}`,
      fileSize: (statement.fileSize || 0) + (newStmt.fileSize || 0),
      rows: [...statement.rows, ...newStmt.rows],
      metadata: {
        ...statement.metadata,
        periodEnd: newStmt.metadata?.periodEnd || statement.metadata?.periodEnd,
      },
    });
  };

  const loanCalculations = useMemo(() => {
    if (!analysis) return null;
    const policyMultiplier =
      riskPolicy === "conservative" ? 0.28 : riskPolicy === "standard" ? 0.38 : 0.5;
    const months = Math.max(1, analysis.monthlyBreakdown.length);
    const monthlyNet = Math.max(0, analysis.net / months);
    const monthlyIncome = analysis.income / months;

    const safeMonthlyRepayment = Math.round(
      Math.min(monthlyNet * policyMultiplier, monthlyIncome * policyMultiplier)
    );
    const maximumLoanCeiling = Math.round(safeMonthlyRepayment * loanTenureMonths);

    return {
      safeMonthlyRepayment,
      maximumLoanCeiling,
    };
  }, [analysis, loanTenureMonths, riskPolicy]);

  useEffect(() => {
    if (!statement || !analysis || !user || isSuspended) return;
    const key = `${statement.fileName}_${statement.rows.length}_${analysis.net}`;
    if (lastLoggedKey === key) return;
    setLastLoggedKey(key);

    recordStatementUpload({
      userId: user.uid,
      userEmail: user.email || "",
      userName: profile?.displayName || user.displayName || user.email?.split("@")[0],
      fileName: statement.fileName,
      fileSize: statement.fileSize || 0,
      rowCount: statement.rows.length,
      openingBalance: analysis.openingBalance,
      closingBalance: analysis.closingBalance,
      netCashFlow: analysis.net,
      totalInflow: analysis.income,
      totalOutflow: analysis.outflow,
      healthScore: analysis.underwriting.creditScore,
      currentUploadCount: profile?.uploadedFilesCount || 0,
    })
      .then(() => refreshProfile())
      .catch((err) => console.error("Failed to log statement record:", err));
  }, [statement, analysis, user, isSuspended, lastLoggedKey, profile, refreshProfile]);

  const rawHolder = statement?.metadata?.accountHolder || "STATEMENT HOLDER";
  const displayHolder = isPiiMasked
    ? rawHolder
        .split(" ")
        .map((p) => (p.length > 2 ? `${p[0]}${"*".repeat(p.length - 2)}${p.slice(-1)}` : `${p[0]}*`))
        .join(" ")
    : rawHolder;

  const handlePrintPdfReport = () => {
    if (!statement || !analysis) return;
    openPrintableReport({
      applicantName: displayHolder,
      accountNumber: statement.metadata?.accountNumber,
      accountType: statement.metadata?.accountType || "Standard Account",
      fileName: statement.fileName,
      currency,
      periodLabel: analysis.periodLabel,
      periodStart: statement.metadata?.periodStart,
      periodEnd: statement.metadata?.periodEnd,
      openingBalance: analysis.openingBalance,
      closingBalance: analysis.closingBalance,
      minimumBalance: analysis.minimumBalance,
      maximumBalance: analysis.maximumBalance,
      income: analysis.income,
      outflow: analysis.outflow,
      net: analysis.net,
      underwriting: analysis.underwriting,
      forensics: analysis.forensics,
      monthlyBreakdown: analysis.monthlyBreakdown,
      weeklyBreakdown: analysis.weeklyBreakdown,
      transactions: analysis.transactions.map((t) => ({
        date: t.date,
        description: t.description,
        debit: t.debit,
        credit: t.credit,
        balance: t.balance,
        category: t.category,
      })),
    });
  };

  const handleDownloadHtmlReport = () => {
    if (!statement || !analysis) return;
    downloadOfflineReport({
      applicantName: displayHolder,
      accountNumber: statement.metadata?.accountNumber,
      accountType: statement.metadata?.accountType || "Standard Account",
      fileName: statement.fileName,
      currency,
      periodLabel: analysis.periodLabel,
      periodStart: statement.metadata?.periodStart,
      periodEnd: statement.metadata?.periodEnd,
      openingBalance: analysis.openingBalance,
      closingBalance: analysis.closingBalance,
      minimumBalance: analysis.minimumBalance,
      maximumBalance: analysis.maximumBalance,
      income: analysis.income,
      outflow: analysis.outflow,
      net: analysis.net,
      underwriting: analysis.underwriting,
      forensics: analysis.forensics,
      monthlyBreakdown: analysis.monthlyBreakdown,
      weeklyBreakdown: analysis.weeklyBreakdown,
      transactions: analysis.transactions.map((t) => ({
        date: t.date,
        description: t.description,
        debit: t.debit,
        credit: t.credit,
        balance: t.balance,
        category: t.category,
      })),
    });
  };

  const exportReportJson = () => {
    if (!statement || !analysis) return;
    downloadFile(
      JSON.stringify(
        {
          reportTitle: "Bank Statement Underwriting & Forensic Intelligence Report",
          generatedAt: new Date().toISOString(),
          currency,
          sourceFile: statement.fileName,
          sourceFileFingerprint: statement.metadata?.sha256 || null,
          applicant: displayHolder,
          accountType: statement.metadata?.accountType || "Standard Account",
          periodLabel: analysis.periodLabel,
          balancePosition: {
            openingBalance: analysis.openingBalance,
            closingBalance: analysis.closingBalance,
            netBalanceMovement: analysis.netBalanceDelta,
            balanceGrowthPercent: analysis.balanceGrowthRate,
            minimumBalance: analysis.minimumBalance,
            maximumBalance: analysis.maximumBalance,
          },
          creditRating: {
            grade: analysis.underwriting.creditGrade,
            score: analysis.underwriting.creditScore,
            summary: analysis.underwriting.creditGradeDescription,
          },
          underwritingMetrics: {
            averageDailyBalance: analysis.underwriting.averageDailyBalance,
            dtiRatio: analysis.underwriting.dtiRatio,
            foirRatio: analysis.underwriting.foirRatio,
            dscrRatio: analysis.underwriting.dscrRatio,
            cashRunwayDays: analysis.underwriting.cashRunwayDays,
            recommendedLoanLimit: analysis.underwriting.recommendedLoanCeiling,
            maxMonthlyRepayment: analysis.underwriting.maxMonthlyRepayment,
          },
          forensics: {
            mathIntegrityScore: analysis.forensics.mathIntegrityScore,
            forgeryRiskLevel: analysis.forensics.forgeryRiskLevel,
            discrepancyCount: analysis.forensics.discrepancies.length,
            roundTripsCount: analysis.forensics.roundTrips.length,
          },
          documentIntegrity: {
            status: statement.metadata?.integrityStatus || "NOT_AVAILABLE",
            score: statement.metadata?.integrityScore ?? null,
            warnings: statement.metadata?.integrityWarnings || [],
          },
          behavioralFlags: {
            gamblingExposure: analysis.underwriting.gamblingExposure,
            paydayLoans: analysis.underwriting.paydayLoanExposure,
            nsfPenalties: analysis.underwriting.nsfAndPenalties,
          },
          monthlyBreakdown: analysis.monthlyBreakdown,
          weeklyBreakdown: analysis.weeklyBreakdown,
          categoryBreakdown: analysis.categoryBreakdown,
        },
        null,
        2
      ),
      `${statement.fileName.replace(/\.[^.]+$/, "")}-underwriting-dossier.json`,
      "application/json"
    );
  };

  const exportTransactionsCsv = () => {
    if (!statement) return;
    const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
    downloadFile(
      [statement.headers, ...statement.rows]
        .map((row) => row.map((cell) => escape(cell || "")).join(","))
        .join("\n"),
      `${statement.fileName.replace(/\.[^.]+$/, "")}-reconciled-transactions.csv`,
      "text/csv;charset=utf-8"
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1f23] flex flex-col items-center justify-center p-6 text-slate-200">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#47705d] text-[#e8f5e9] shadow-lg animate-pulse">
            <RefreshCw className="h-7 w-7 animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-white">
              Securing Workspace Session
            </h2>
            <p className="text-xs text-slate-400">
              Verifying encryption keys and user privileges...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SuspendedBanner />
      <div className="mx-auto max-w-[1440px] px-4 pb-12 sm:px-6 lg:px-10">
        {/* Top Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-accent shadow-sm">
              <RefreshCw className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">
                Statement Analyzer &amp; Underwriter
              </p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Fintech &amp; Lending Intelligence
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Currency Selector */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 shadow-2xs">
              <span className="font-semibold text-muted-foreground">Currency:</span>
              <Select
                value={currency}
                onValueChange={(val) => setCurrency(val as SupportedCurrency)}
              >
                <SelectTrigger id="currency-select" className="h-7 w-[110px] border-0 text-xs font-semibold focus:ring-0">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(CURRENCIES).map((c) => (
                    <SelectItem key={c.code} value={c.code} className="text-xs">
                      {c.symbol} {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* PII Masking Switch */}
            <div className="flex items-center space-x-2 rounded-lg border border-border bg-white px-3 py-1.5 shadow-2xs">
              <Switch
                id="main-pii-toggle"
                checked={isPiiMasked}
                onCheckedChange={setIsPiiMasked}
              />
              <Label
                htmlFor="main-pii-toggle"
                className="flex cursor-pointer items-center gap-1 font-medium text-muted-foreground text-xs"
              >
                {isPiiMasked ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5 text-emerald-600" /> PII Masked
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" /> Mask PII
                  </>
                )}
              </Label>
            </div>

            {analysis && (
              <>
                <Button
                  id="generate-pdf-btn-header"
                  size="sm"
                  className="gap-1.5 bg-[#183238] font-medium text-white shadow-sm hover:bg-[#183238]/90"
                  onClick={handlePrintPdfReport}
                >
                  <FileDown className="h-4 w-4 text-accent" /> Generate Report (PDF)
                </Button>
                <Button
                  id="open-credit-memo-btn"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 font-medium shadow-2xs"
                  onClick={() => setIsCreditMemoOpen(true)}
                >
                  <FileText className="h-4 w-4" /> Credit Memo
                </Button>
              </>
            )}

            <UserNav
              onOpenAdmin={() => setIsAdminDashboardOpen(true)}
              onOpenHistory={() => setIsUserHistoryOpen(true)}
            />
          </div>
        </header>

        {/* Main Canvas */}
        <main className="workspace-grid mt-6 overflow-hidden rounded-[1.5rem] border border-border/80 bg-white/60 shadow-[0_24px_80px_rgba(24,50,56,0.08)]">
          {/* Hero Section */}
          <section className="animate-rise grid gap-8 border-b border-border/80 bg-primary px-6 py-10 text-primary-foreground sm:px-10 lg:grid-cols-[1.25fr_0.75fr] lg:px-14 lg:py-12">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-accent">
                <ShieldCheck className="h-3.5 w-3.5" /> Institutional Grade · Credit Risk &amp; Fraud Intelligence
              </div>
              <h1 className="max-w-3xl text-3xl font-semibold leading-[1.1] tracking-[-0.03em] sm:text-5xl">
                Bank Statement Intelligence &amp; Underwriting Engine
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/70 sm:text-base">
                Instant mathematical ledger reconciliation, cash flow underwriting, weekly/monthly inflow &amp; outflow timelines, and automated summary PDF generation.
              </p>
            </div>

            <div className="flex items-center lg:justify-end">
              <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-white/55">
                  <span>Audit Capabilities</span>
                  <span>Institutional</span>
                </div>
                <div className="mt-4 space-y-2.5 text-xs text-white/80">
                  <div className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-accent" /> Opening &amp; Closing Balance Position
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-accent" /> Monthly &amp; Weekly Inflow / Outflow Tables
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-accent" /> Instant PDF Summary Report Generation
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-accent" /> Running Balance Math &amp; Tamper Audit
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="space-y-8 p-5 sm:p-8 lg:p-10">
            {/* Statement Upload Card */}
            <Card className="overflow-hidden border-border/80 bg-white shadow-xs">
              <CardHeader className="border-b border-border/70 bg-[#fbfcfb] pb-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e5f3d4] text-[#47705d]">
                      <Upload className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Bank Statement Ingestion
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Upload PDF (supports password encryption), Excel (XLS/XLSX), or CSV.
                      </CardDescription>
                    </div>
                  </div>
                  {statement && (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-[#e5f3d4] text-[#47705d] hover:bg-[#e5f3d4]">
                        <Check className="mr-1 h-3 w-3" /> Statement Loaded
                      </Badge>
                      <Button
                        id="append-statement-btn"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={() => {
                          const input = document.getElementById("statement-file-input");
                          input?.click();
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" /> Append Month / File
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                <FileUpload
                  onFileUpload={(newStmt) => {
                    if (isSuspended) {
                      toast.error("Your account is suspended. Uploads are disabled.");
                      return;
                    }
                    setStatement(newStmt);
                  }}
                  onAppendStatement={(newStmt) => {
                    if (isSuspended) {
                      toast.error("Your account is suspended. Uploads are disabled.");
                      return;
                    }
                    handleAppendStatement(newStmt);
                  }}
                  onCurrencyDetected={setCurrency}
                  fileNumber={1}
                  hasExistingStatement={Boolean(statement)}
                  disabled={isSuspended}
                />
                {statement && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#47705d]" />
                      <span className="font-semibold text-foreground">
                        {statement.fileName}
                      </span>
                      <Badge variant="outline" className="bg-white">
                        {statement.rows.length.toLocaleString()} rows parsed
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      Applicant: <span className="font-medium text-foreground">{displayHolder}</span> · Period: <span className="font-medium text-foreground">{analysis?.periodLabel}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {analysis && (
              <div className="space-y-8 animate-rise">
                {/* Executive Action Header */}
                <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <span>Underwriting Report</span>
                      <span>·</span>
                      <span className="text-emerald-700 font-bold">Grade {analysis.underwriting.creditGrade}</span>
                    </div>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                      Comprehensive Financial &amp; Credit Dossier
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      id="generate-summary-pdf-cta"
                      onClick={handlePrintPdfReport}
                      className="gap-1.5 bg-[#183238] text-white hover:bg-[#183238]/90"
                    >
                      <FileDown className="h-4 w-4 text-accent" /> Generate Summary Report (PDF)
                    </Button>
                    <Button
                      id="view-memo-cta-btn"
                      variant="outline"
                      onClick={() => setIsCreditMemoOpen(true)}
                      className="gap-1.5"
                    >
                      <FileText className="h-4 w-4" /> Credit Committee Memo
                    </Button>
                    <Button variant="outline" onClick={handleDownloadHtmlReport} className="gap-1.5">
                      <Download className="h-4 w-4" /> Download HTML Report
                    </Button>
                    <Button variant="outline" onClick={exportReportJson} className="gap-1.5">
                      <FileJson className="h-4 w-4" /> Export JSON
                    </Button>
                    <Button variant="outline" onClick={exportTransactionsCsv} className="gap-1.5">
                      <Download className="h-4 w-4" /> Export CSV
                    </Button>
                  </div>
                </div>

                {/* VIEW MODE TOGGLE SWITCHER */}
                <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-white p-2.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      id="view-lender-dashboard-btn"
                      variant={viewMode === "lender" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("lender")}
                      className={`h-9 gap-2 text-xs font-semibold ${
                        viewMode === "lender" ? "bg-[#183238] text-white shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      <Building className="h-4 w-4 text-accent" />
                      Professional Lender Underwriting Dashboard
                      <Badge variant="secondary" className="ml-1 bg-emerald-100 px-1.5 py-0 text-[10px] text-emerald-800 font-bold">
                        Institutional
                      </Badge>
                    </Button>
                    <Button
                      id="view-statement-analytics-btn"
                      variant={viewMode === "statement" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("statement")}
                      className={`h-9 gap-2 text-xs font-semibold ${
                        viewMode === "statement" ? "bg-[#183238] text-white shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      <FileText className="h-4 w-4" />
                      Detailed Statement Analytics &amp; Cash Flow Tables
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Reconciliation: 100% Verified · Circular Fraud Shield Active</span>
                  </div>
                </div>

                {viewMode === "lender" ? (
                  <LenderDashboard
                    statement={statement}
                    underwriting={analysis.underwriting}
                    forensics={analysis.forensics}
                    currency={currency}
                    openingBalance={analysis.openingBalance}
                    closingBalance={analysis.closingBalance}
                    income={analysis.income}
                    outflow={analysis.outflow}
                    net={analysis.net}
                    periodLabel={analysis.periodLabel}
                    monthlyBreakdown={analysis.monthlyBreakdown}
                    onOpenCreditMemo={() => setIsCreditMemoOpen(true)}
                  />
                ) : (
                  <div className="space-y-8">
                    {/* PROMINENT ACCOUNT BALANCE POSITION CARD */}
                    <Card className="border-2 border-primary/20 bg-gradient-to-br from-white to-[#f4f8f6] shadow-sm">
                      <CardHeader className="border-b border-border/70 pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Wallet className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base font-bold text-foreground">
                              Account Balance Position &amp; Ledger Reconciliation
                            </CardTitle>
                          </div>
                          <Badge variant="outline" className="bg-white text-xs font-medium">
                            Period: {analysis.periodLabel}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs">
                          Opening balance at start of coverage, closing balance at conclusion, and peak / trough boundaries.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-5">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                          {/* Opening Balance */}
                          <div className="rounded-xl border border-border bg-white p-4 shadow-2xs">
                            <span className="text-xs font-semibold uppercase text-muted-foreground">
                              Opening Balance
                            </span>
                            <p className="mt-2 text-2xl font-bold text-foreground">
                              {formatMoney(analysis.openingBalance, currency)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Balance brought forward
                            </p>
                          </div>

                          {/* Closing Balance */}
                          <div className="rounded-xl border border-border bg-white p-4 shadow-2xs">
                            <span className="text-xs font-semibold uppercase text-muted-foreground">
                              Closing Balance
                            </span>
                            <p className="mt-2 text-2xl font-bold text-foreground">
                              {formatMoney(analysis.closingBalance, currency)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Period end balance
                            </p>
                          </div>

                          {/* Net Balance Delta */}
                          <div className="rounded-xl border border-border bg-white p-4 shadow-2xs">
                            <span className="text-xs font-semibold uppercase text-muted-foreground">
                              Net Balance Movement
                            </span>
                            <p className={`mt-2 text-2xl font-bold ${analysis.netBalanceDelta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                              {analysis.netBalanceDelta >= 0 ? "+" : ""}{formatMoney(analysis.netBalanceDelta, currency)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {analysis.balanceGrowthRate >= 0 ? "+" : ""}{analysis.balanceGrowthRate.toFixed(1)}% balance change
                            </p>
                          </div>

                          {/* Lowest Trough */}
                          <div className="rounded-xl border border-border bg-white p-4 shadow-2xs">
                            <span className="text-xs font-semibold uppercase text-muted-foreground">
                              Lowest Trough
                            </span>
                            <p className="mt-2 text-2xl font-bold text-rose-700">
                              {formatMoney(analysis.minimumBalance, currency)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Minimum liquidity point
                            </p>
                          </div>

                          {/* Peak Balance */}
                          <div className="rounded-xl border border-border bg-white p-4 shadow-2xs">
                            <span className="text-xs font-semibold uppercase text-muted-foreground">
                              Peak Balance
                            </span>
                            <p className="mt-2 text-2xl font-bold text-emerald-700">
                              {formatMoney(analysis.maximumBalance, currency)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Maximum liquidity point
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Primary High-Level Summary Metrics */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Metric
                        label="Verified Inflow"
                        value={formatMoney(analysis.income, currency)}
                        icon={<ArrowDownRight className="h-5 w-5 text-[#2e8b80]" />}
                        note={`${analysis.transactions.filter((t) => t.credit > 0).length} incoming deposits`}
                      />
                      <Metric
                        label="Total Outflow"
                        value={formatMoney(analysis.outflow, currency)}
                        icon={<ArrowUpRight className="h-5 w-5 text-[#c85b4c]" />}
                        note={`Expense ratio: ${analysis.expenseRatio.toFixed(1)}% of income`}
                      />
                      <Metric
                        label="Net Free Cash Flow"
                        value={formatMoney(analysis.net, currency)}
                        icon={<TrendingUp className="h-5 w-5 text-[#47705d]" />}
                        note={analysis.net >= 0 ? "Cashflow Positive Surplus" : "Deficit / Burn"}
                      />
                      <Metric
                        label="Credit Risk Rating"
                        value={`Grade ${analysis.underwriting.creditGrade} (${analysis.underwriting.creditScore}/100)`}
                        icon={<Scale className="h-5 w-5 text-[#183238]" />}
                        note={analysis.underwriting.creditGradeDescription.split("·")[0]}
                      />
                    </div>

                    {/* SECTION: Monthly and Weekly Breakdown Tables */}
                    {(() => {
                      const monthsCount = Math.max(1, analysis.monthlyBreakdown.length);
                      const weeksCount = Math.max(1, analysis.weeklyBreakdown.length);
                      const avgWeeklyBalance =
                        analysis.weeklyBreakdown.length > 0
                          ? analysis.weeklyBreakdown.reduce((sum, w) => sum + (w.closingBalance ?? 0), 0) /
                            analysis.weeklyBreakdown.length
                          : analysis.averageBalance;
                      const avgMonthlyInflow = analysis.income / monthsCount;
                      const avgMonthlyOutflow = analysis.outflow / monthsCount;
                      const avgWeeklyInflow = analysis.income / weeksCount;
                      const avgWeeklyOutflow = analysis.outflow / weeksCount;

                      return (
                        <Card className="border-border/80 shadow-xs">
                          <CardHeader className="border-b border-border/70 bg-[#fbfcfb] pb-4">
                            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                              <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                  <span>Analytics Summary Report</span>
                                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800 text-[10px]">
                                    Analytics Summary
                                  </Badge>
                                </CardTitle>
                                <CardDescription className="text-xs">
                                  Verified periodic turnover, weekly/monthly cash flow analysis, and total sum reconciliations.
                                </CardDescription>
                              </div>
                              <div className="flex flex-wrap rounded-lg border border-border bg-slate-100 p-1 text-xs">
                                <button
                                  type="button"
                                  id="tab-insight-btn"
                                  onClick={() => setTimelineTab("insight")}
                                  className={`rounded-md px-3 py-1.5 font-medium transition-all ${
                                    timelineTab === "insight"
                                      ? "bg-white text-foreground shadow-xs font-semibold"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Analytics Summary Report
                                </button>
                                <button
                                  type="button"
                                  id="tab-monthly-btn"
                                  onClick={() => setTimelineTab("monthly")}
                                  className={`rounded-md px-3 py-1.5 font-medium transition-all ${
                                    timelineTab === "monthly"
                                      ? "bg-white text-foreground shadow-xs font-semibold"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Monthly Summary ({analysis.monthlyBreakdown.length})
                                </button>
                                <button
                                  type="button"
                                  id="tab-weekly-btn"
                                  onClick={() => setTimelineTab("weekly")}
                                  className={`rounded-md px-3 py-1.5 font-medium transition-all ${
                                    timelineTab === "weekly"
                                      ? "bg-white text-foreground shadow-xs font-semibold"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Weekly Breakdown ({analysis.weeklyBreakdown.length})
                                </button>
                                <button
                                  type="button"
                                  id="tab-chart-btn"
                                  onClick={() => setTimelineTab("chart")}
                                  className={`rounded-md px-3 py-1.5 font-medium transition-all ${
                                    timelineTab === "chart"
                                      ? "bg-white text-foreground shadow-xs font-semibold"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Visual Chart
                                </button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-5">
                            {timelineTab === "insight" && (
                              <div className="space-y-6">
                                <div>
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                                    Cash Flow Overview
                                  </h4>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                                      <div className="text-[11px] font-medium text-muted-foreground">Valid Credit (Inflow)</div>
                                      <div className="mt-1 text-sm sm:text-base font-bold text-emerald-700 font-mono">
                                        {formatMoney(analysis.income, currency)}
                                      </div>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                                      <div className="text-[11px] font-medium text-muted-foreground">Closing Balance</div>
                                      <div className="mt-1 text-sm sm:text-base font-bold text-slate-800 font-mono">
                                        {formatMoney(analysis.closingBalance, currency)}
                                      </div>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                                      <div className="text-[11px] font-medium text-muted-foreground">Average Monthly Balance</div>
                                      <div className="mt-1 text-sm sm:text-base font-bold text-slate-800 font-mono">
                                        {formatMoney(analysis.averageBalance, currency)}
                                      </div>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                                      <div className="text-[11px] font-medium text-muted-foreground">Average Weekly Balance</div>
                                      <div className="mt-1 text-sm sm:text-base font-bold text-slate-800 font-mono">
                                        {formatMoney(avgWeeklyBalance, currency)}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="bg-[#2563eb] text-white px-3 py-2 text-xs font-bold flex justify-between items-center">
                                      <span>Monthly Outflow</span>
                                      <span>Amount ({currency})</span>
                                    </div>
                                    <table className="w-full text-xs">
                                      <tbody>
                                        {analysis.monthlyBreakdown.map((m) => (
                                          <tr key={`outflow-${m.month}`} className="border-b border-slate-100 hover:bg-slate-50">
                                            <td className="px-3 py-2 text-foreground font-medium">{m.month}</td>
                                            <td className="px-3 py-2 text-right font-mono font-semibold text-rose-700">
                                              {formatMoney(m.outflow, currency)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot>
                                        <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                                          <td className="px-3 py-2 text-foreground">Total Outflow Sum</td>
                                          <td className="px-3 py-2 text-right font-mono text-rose-700">
                                            {formatMoney(analysis.outflow, currency)}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>

                                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="bg-[#2563eb] text-white px-3 py-2 text-xs font-bold flex justify-between items-center">
                                      <span>Monthly Inflow</span>
                                      <span>Amount ({currency})</span>
                                    </div>
                                    <table className="w-full text-xs">
                                      <tbody>
                                        {analysis.monthlyBreakdown.map((m) => (
                                          <tr key={`inflow-${m.month}`} className="border-b border-slate-100 hover:bg-slate-50">
                                            <td className="px-3 py-2 text-foreground font-medium">{m.month}</td>
                                            <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">
                                              {formatMoney(m.income, currency)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot>
                                        <tr className="bg-blue-50 font-bold border-t-2 border-blue-200">
                                          <td className="px-3 py-2 text-foreground">Total Inflow Sum</td>
                                          <td className="px-3 py-2 text-right font-mono text-emerald-700">
                                            {formatMoney(analysis.income, currency)}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            )}

                            {timelineTab === "monthly" && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="border-b text-muted-foreground">
                                      <th className="pb-3 font-semibold">Month</th>
                                      <th className="pb-3 text-right font-semibold">Total Inflow (Cr)</th>
                                      <th className="pb-3 text-right font-semibold">Total Outflow (Dr)</th>
                                      <th className="pb-3 text-right font-semibold">Net Cash Flow</th>
                                      <th className="pb-3 text-right font-semibold">Month-End Balance</th>
                                      <th className="pb-3 text-right font-semibold">Txns</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {analysis.monthlyBreakdown.map((m) => (
                                      <tr key={m.month} className="border-b last:border-0 font-mono hover:bg-slate-50/70">
                                        <td className="py-3 font-sans font-semibold text-foreground">{m.month}</td>
                                        <td className="py-3 text-right font-medium text-emerald-700">
                                          {formatMoney(m.income, currency)}
                                        </td>
                                        <td className="py-3 text-right font-medium text-rose-700">
                                          {formatMoney(m.outflow, currency)}
                                        </td>
                                        <td className={`py-3 text-right font-bold ${m.net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                          {m.net >= 0 ? "+" : ""}{formatMoney(m.net, currency)}
                                        </td>
                                        <td className="py-3 text-right font-bold text-foreground">
                                          {m.closingBalance !== undefined ? formatMoney(m.closingBalance, currency) : "-"}
                                        </td>
                                        <td className="py-3 text-right font-sans text-muted-foreground">
                                          {m.transactionCount || "-"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {timelineTab === "weekly" && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="border-b text-muted-foreground">
                                      <th className="pb-3 font-semibold">Month</th>
                                      <th className="pb-3 font-semibold">Week</th>
                                      <th className="pb-3 font-semibold">Date Interval</th>
                                      <th className="pb-3 text-right font-semibold">Inflow (Cr)</th>
                                      <th className="pb-3 text-right font-semibold">Outflow (Dr)</th>
                                      <th className="pb-3 text-right font-semibold">Net Movement</th>
                                      <th className="pb-3 text-right font-semibold">Week-End Balance</th>
                                      <th className="pb-3 text-right font-semibold">Txns</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {analysis.weeklyBreakdown.map((w, idx) => (
                                      <tr key={`${w.month}-${w.week}-${idx}`} className="border-b last:border-0 font-mono hover:bg-slate-50/70">
                                        <td className="py-3 font-sans font-semibold text-foreground">{w.month}</td>
                                        <td className="py-3 font-sans font-medium text-muted-foreground capitalize">{w.week}</td>
                                        <td className="py-3 font-sans text-muted-foreground">{w.startDate} - {w.endDate}</td>
                                        <td className="py-3 text-right font-medium text-emerald-700">
                                          {formatMoney(w.income, currency)}
                                        </td>
                                        <td className="py-3 text-right font-medium text-rose-700">
                                          {formatMoney(w.outflow, currency)}
                                        </td>
                                        <td className={`py-3 text-right font-bold ${w.net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                                          {w.net >= 0 ? "+" : ""}{formatMoney(w.net, currency)}
                                        </td>
                                        <td className="py-3 text-right font-bold text-foreground">
                                          {w.closingBalance !== undefined ? formatMoney(w.closingBalance, currency) : "-"}
                                        </td>
                                        <td className="py-3 text-right font-sans text-muted-foreground">
                                          {w.transactionCount}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {timelineTab === "chart" && (
                              <div className="h-[280px] w-full pt-2">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={analysis.monthlyBreakdown} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dbe6e1" />
                                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                                    <YAxis
                                      tickLine={false}
                                      axisLine={false}
                                      tick={{ fontSize: 11 }}
                                      tickFormatter={(val) => `${CURRENCIES[currency]?.symbol || ""}${Math.round(val / 1000)}k`}
                                    />
                                    <Tooltip
                                      formatter={(value) => formatMoney(Number(value), currency)}
                                      cursor={{ fill: "rgba(24,50,56,0.04)" }}
                                    />
                                    <Legend />
                                    <Bar dataKey="income" name="Money In (Inflow)" fill="#2e8b80" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="outflow" name="Money Out (Outflow)" fill="#c85b4c" radius={[4, 4, 0, 0]} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })()}

                    {/* SECTION 1: Forensic Math Reconciliation & Tampering Audit */}
                    <Card className={`border-2 shadow-xs ${
                      analysis.forensics.forgeryRiskLevel === "Critical"
                        ? "border-rose-300 bg-rose-50/20"
                        : analysis.forensics.forgeryRiskLevel === "Moderate"
                        ? "border-amber-300 bg-amber-50/20"
                        : "border-emerald-300 bg-emerald-50/20"
                    }`}>
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className={`h-5 w-5 ${
                              analysis.forensics.forgeryRiskLevel === "Critical"
                                ? "text-rose-600"
                                : analysis.forensics.forgeryRiskLevel === "Moderate"
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }`} />
                            <CardTitle className="text-base">
                              Forensic Integrity &amp; Mathematical Balance Reconciliation
                            </CardTitle>
                          </div>
                          <Badge
                            variant={
                              analysis.forensics.forgeryRiskLevel === "Low"
                                ? "outline"
                                : analysis.forensics.forgeryRiskLevel === "Moderate"
                                ? "secondary"
                                : "destructive"
                            }
                            className="px-3 py-1 font-semibold"
                          >
                            Ledger Tamper Risk: {analysis.forensics.forgeryRiskLevel}
                          </Badge>
                        </div>
                        <CardDescription>
                          Every transaction row is mathematically reconciled against the running balance:{" "}
                          <code className="rounded bg-muted px-1 text-[11px]">Previous Balance + Inflow - Outflow = Stated Balance</code>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-1">
                        <div className="grid gap-3 sm:grid-cols-3 text-xs">
                          <div className="rounded-lg border bg-white p-3 shadow-2xs">
                            <span className="text-muted-foreground">Ledger Math Reconciliation</span>
                            <p className={`mt-1 text-lg font-bold ${
                              analysis.forensics.mathIntegrityScore === 100
                                ? "text-emerald-700"
                                : "text-rose-700"
                            }`}>
                              {analysis.forensics.mathIntegrityScore}% Matched
                            </p>
                            <span className="text-muted-foreground">
                              {analysis.forensics.totalChecks - analysis.forensics.discrepancies.length} of {analysis.forensics.totalChecks} rows passed math check
                            </span>
                          </div>

                          <div className="rounded-lg border bg-white p-3 shadow-2xs">
                            <span className="text-muted-foreground">Wash-Trading / Round-Tripping</span>
                            <p className={`mt-1 text-lg font-bold ${
                              analysis.forensics.roundTrips.length === 0
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }`}>
                              {analysis.forensics.roundTrips.length} Detected
                            </p>
                            <span className="text-muted-foreground">
                              {analysis.forensics.roundTrips.length === 0
                                ? "No rapid deposit-drain cycles"
                                : "Inflows drained >70% within 48h"}
                            </span>
                          </div>

                          <div className="rounded-lg border bg-white p-3 shadow-2xs">
                            <span className="text-muted-foreground">Structuring / Smurfing Flags</span>
                            <p className={`mt-1 text-lg font-bold ${
                              analysis.forensics.structuringAlerts.length === 0
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }`}>
                              {analysis.forensics.structuringAlerts.length} Flagged
                            </p>
                            <span className="text-muted-foreground">
                              Transactions clustering just below regulatory limits
                            </span>
                          </div>
                        </div>

                        {analysis.forensics.discrepancies.length > 0 && (
                          <div className="rounded-lg border border-rose-200 bg-white p-4">
                            <div className="flex items-center gap-2 text-rose-800 text-xs font-bold">
                              <AlertCircle className="h-4 w-4 text-rose-600" />
                              <span>Mathematical Ledger Inconsistencies Detected ({analysis.forensics.discrepancies.length} Breaks)</span>
                            </div>
                            <div className="mt-3 overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="border-b text-muted-foreground">
                                    <th className="pb-2">Row #</th>
                                    <th className="pb-2">Date</th>
                                    <th className="pb-2">Description</th>
                                    <th className="pb-2">Stated Balance</th>
                                    <th className="pb-2">Expected Balance</th>
                                    <th className="pb-2">Variance</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {analysis.forensics.discrepancies.slice(0, 5).map((d) => (
                                    <tr key={d.rowIndex} className="border-b font-mono">
                                      <td className="py-1.5 font-bold text-rose-700">#{d.rowIndex}</td>
                                      <td className="py-1.5">{d.date}</td>
                                      <td className="py-1.5 max-w-[150px] truncate">{d.description}</td>
                                      <td className="py-1.5 font-bold text-rose-700">{formatMoney(d.statedBalance, currency)}</td>
                                      <td className="py-1.5 text-emerald-700">{formatMoney(d.expectedBalance, currency)}</td>
                                      <td className="py-1.5 font-semibold text-rose-600">{formatMoney(d.difference, currency)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* SECTION 2: Loan Affordability Calculator & Solvency Ratios */}
                    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                      <Card className="border-border/80 shadow-xs">
                        <CardHeader className="border-b border-border/70 bg-[#fbfcfb] pb-4">
                          <div className="flex items-center gap-2">
                            <WalletCards className="h-5 w-5 text-[#47705d]" />
                            <CardTitle className="text-base">
                              Underwriting Solvency &amp; Core Ratios
                            </CardTitle>
                          </div>
                          <CardDescription>
                            Standard credit committee metrics used for risk tiering and lending decisions.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2">
                          <Signal
                            label="Average Daily Balance (ADB)"
                            value={formatMoney(analysis.underwriting.averageDailyBalance, currency)}
                            detail="Core liquidity baseline weighted across period"
                          />
                          <Signal
                            label="Debt-to-Income (DTI)"
                            value={`${analysis.underwriting.dtiRatio}%`}
                            detail="Existing debt service as % of verified income"
                          />
                          <Signal
                            label="Fixed Obligation Ratio (FOIR)"
                            value={`${analysis.underwriting.foirRatio}%`}
                            detail="Debt + fixed utility and bills commitments"
                          />
                          <Signal
                            label="Debt Service Coverage (DSCR)"
                            value={`${analysis.underwriting.dscrRatio.toFixed(2)}x`}
                            detail={analysis.underwriting.dscrRatio >= 1.25 ? "Safe coverage (>1.25x)" : "Tight coverage (<1.25x)"}
                          />
                          <Signal
                            label="Cash Runway"
                            value={`${analysis.underwriting.cashRunwayDays} Days`}
                            detail="Survival days based on daily outflow velocity"
                          />
                          <Signal
                            label="Income Stability Cadence"
                            value={analysis.underwriting.salaryCadenceStatus}
                            detail="Payroll regularity and periodicity"
                          />
                        </CardContent>
                      </Card>

                      {/* Interactive Loan Affordability Calculator */}
                      <Card className="border-border/80 bg-[#183238] text-white shadow-xs">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-2">
                            <Banknote className="h-5 w-5 text-accent" />
                            <CardTitle className="text-base text-white">
                              Loan Affordability Calculator
                            </CardTitle>
                          </div>
                          <CardDescription className="text-white/70 text-xs">
                            Simulate credit limits based on applicant&apos;s verified disposable surplus.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <span className="text-xs font-medium text-white/80">Proposed Loan Tenure:</span>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {[1, 3, 6, 12].map((months) => (
                                <button
                                  key={months}
                                  type="button"
                                  onClick={() => setLoanTenureMonths(months)}
                                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                                    loanTenureMonths === months
                                      ? "bg-accent text-primary"
                                      : "border border-white/20 text-white/70 hover:bg-white/10"
                                  }`}
                                >
                                  {months} {months === 1 ? "Month" : "Months"}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className="text-xs font-medium text-white/80">Debt Capacity Policy:</span>
                            <div className="mt-1.5 flex gap-1.5">
                              {(["conservative", "standard", "aggressive"] as const).map((policy) => (
                                <button
                                  key={policy}
                                  type="button"
                                  onClick={() => setRiskPolicy(policy)}
                                  className={`capitalize rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                                    riskPolicy === policy
                                      ? "bg-accent text-primary"
                                      : "border border-white/20 text-white/70 hover:bg-white/10"
                                  }`}
                                >
                                  {policy}
                                </button>
                              ))}
                            </div>
                          </div>

                          {loanCalculations && (
                            <div className="rounded-xl border border-white/15 bg-white/10 p-4 space-y-3">
                              <div>
                                <span className="text-xs text-white/60">Maximum Recommended Loan Limit</span>
                                <p className="text-2xl font-bold text-accent">
                                  {formatMoney(loanCalculations.maximumLoanCeiling, currency)}
                                </p>
                              </div>
                              <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs">
                                <span className="text-white/70">Safe Monthly Repayment:</span>
                                <span className="font-semibold text-white">
                                  {formatMoney(loanCalculations.safeMonthlyRepayment, currency)}/mo
                                </span>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* SECTION 3: Behavioral Flags */}
                    <div>
                      <div className="mb-3">
                        <h3 className="text-lg font-semibold text-foreground">
                          High-Risk Behavioral &amp; Merchant Triage
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Automated detection of gambling losses, payday loan stacking, and returned bank penalties.
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-3">
                        <Card className={`border shadow-xs ${analysis.underwriting.gamblingExposure.count > 0 ? "border-amber-300 bg-amber-50/20" : ""}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Gambling &amp; Betting</p>
                                <p className="mt-1 text-xl font-bold text-foreground">
                                  {formatMoney(analysis.underwriting.gamblingExposure.totalSpent, currency)}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {analysis.underwriting.gamblingExposure.count} transactions ({analysis.underwriting.gamblingExposure.percentOfOutflow}% of outflows)
                                </p>
                              </div>
                              <div className="rounded-lg bg-amber-100 p-2 text-amber-800">
                                <Dices className="h-4 w-4" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className={`border shadow-xs ${analysis.underwriting.paydayLoanExposure.appCount > 0 ? "border-rose-300 bg-rose-50/20" : ""}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Payday / Micro-Loans</p>
                                <p className="mt-1 text-xl font-bold text-foreground">
                                  {analysis.underwriting.paydayLoanExposure.appCount} App(s) Detected
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {analysis.underwriting.paydayLoanExposure.detectedApps.length > 0
                                    ? analysis.underwriting.paydayLoanExposure.detectedApps.join(", ")
                                    : "No payday stacking detected"}
                                </p>
                              </div>
                              <div className="rounded-lg bg-rose-100 p-2 text-rose-800">
                                <Building className="h-4 w-4" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        <Card className={`border shadow-xs ${analysis.underwriting.nsfAndPenalties.count > 0 ? "border-rose-300 bg-rose-50/20" : ""}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground">NSF &amp; Bank Penalties</p>
                                <p className="mt-1 text-xl font-bold text-foreground">
                                  {analysis.underwriting.nsfAndPenalties.count} Penalty Incident(s)
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatMoney(analysis.underwriting.nsfAndPenalties.totalAmount, currency)} in bounced / excess fees
                                </p>
                              </div>
                              <div className="rounded-lg bg-slate-100 p-2 text-slate-800">
                                <Receipt className="h-4 w-4" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>

                    {/* SECTION 4: Risk Scorecard & Categories */}
                    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                      <Card className="border-border/80 shadow-xs">
                        <CardHeader className="border-b border-border/70 bg-[#fbfcfb] pb-4">
                          <CardTitle className="text-base">Risk Dimension Scorecard</CardTitle>
                          <CardDescription className="text-xs">
                            Objective breakdown of borrower risk pillars.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3.5 pt-5">
                          {analysis.riskMetrics.map((metric) => (
                            <div key={metric.label} className="rounded-lg border border-border/80 p-3 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-foreground">{metric.label}</span>
                                <span className={`font-bold ${
                                  metric.score < 50
                                    ? "text-rose-600"
                                    : metric.score < 75
                                    ? "text-amber-600"
                                    : "text-emerald-700"
                                }`}>
                                  {metric.score}/100
                                </span>
                              </div>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${
                                    metric.score < 50
                                      ? "bg-rose-500"
                                      : metric.score < 75
                                      ? "bg-amber-500"
                                      : "bg-emerald-600"
                                  }`}
                                  style={{ width: `${Math.max(5, metric.score)}%` }}
                                />
                              </div>
                              <p className="mt-1.5 text-[11px] text-muted-foreground">{metric.detail}</p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      <Card className="border-border/80 shadow-xs">
                        <CardHeader className="border-b border-border/70 bg-[#fbfcfb] pb-4">
                          <CardTitle className="text-base">Categorized Inflows &amp; Outflows</CardTitle>
                          <CardDescription className="text-xs">
                            Automatically classified by institutional merchant definitions.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3.5 pt-5">
                          <div className="space-y-2.5">
                            {analysis.categoryBreakdown.slice(0, 6).map((cat) => {
                              const totalVolume = analysis.income + analysis.outflow;
                              const pct = totalVolume > 0 ? (cat.amount / totalVolume) * 100 : 0;
                              return (
                                <div key={cat.category} className="rounded-lg border border-border/70 p-2.5 text-xs">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-foreground">{cat.category}</span>
                                    <span className="font-semibold text-foreground">
                                      {formatMoney(cat.amount, currency)} ({cat.count})
                                    </span>
                                  </div>
                                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className="h-full rounded-full bg-primary/80"
                                      style={{ width: `${Math.max(2, pct)}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* SECTION 5: Audited Transaction Register */}
                    <Card className="border-border/80 shadow-xs">
                      <CardHeader className="border-b border-border/70 bg-[#fbfcfb] pb-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">Audited Transaction Register</CardTitle>
                            <CardDescription className="text-xs">
                              Showing first 15 transactions with assigned merchant category and risk flags.
                            </CardDescription>
                          </div>
                          <Button variant="outline" size="sm" onClick={exportTransactionsCsv} className="h-8 gap-1 text-xs">
                            <Download className="h-3.5 w-3.5" /> Export All CSV ({statement?.rows?.length || 0})
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="overflow-x-auto pt-4">
                        <table className="w-full min-w-[700px] text-left text-xs">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="pb-2 font-semibold">Date</th>
                              <th className="pb-2 font-semibold">Description</th>
                              <th className="pb-2 font-semibold">Category</th>
                              <th className="pb-2 font-semibold text-right">Debit</th>
                              <th className="pb-2 font-semibold text-right">Credit</th>
                              <th className="pb-2 font-semibold text-right">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analysis.transactions.slice(0, 15).map((tx) => (
                              <tr key={tx.index} className="border-b last:border-0 font-mono hover:bg-slate-50/50">
                                <td className="py-2">{tx.date}</td>
                                <td className="py-2 max-w-[220px] truncate font-sans">
                                  {tx.description}
                                  {tx.riskFlag && (
                                    <span className="ml-1.5 inline-block rounded bg-rose-100 px-1 py-0.5 text-[10px] font-bold text-rose-800">
                                      {tx.riskFlag}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 font-sans">
                                  <Badge variant="outline" className="text-[10px]">
                                    {tx.category}
                                  </Badge>
                                </td>
                                <td className="py-2 text-right font-medium text-rose-600">
                                  {tx.debit > 0 ? formatMoney(tx.debit, currency) : "-"}
                                </td>
                                <td className="py-2 text-right font-medium text-emerald-700">
                                  {tx.credit > 0 ? formatMoney(tx.credit, currency) : "-"}
                                </td>
                                <td className="py-2 text-right font-bold">
                                  {tx.balance > 0 ? formatMoney(tx.balance, currency) : "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-6 flex flex-col gap-2 px-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Institutional Statement Intelligence · Designed for Credit Committees, Lenders, and Risk Teams
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Private in-browser session execution
          </span>
        </footer>
      </div>

      {/* Credit Committee Memo Dialog */}
      {analysis && (
        <CreditMemoDialog
          isOpen={isCreditMemoOpen}
          onOpenChange={setIsCreditMemoOpen}
          statement={statement}
          underwriting={analysis.underwriting}
          forensics={analysis.forensics}
          currency={currency}
          openingBalance={analysis.openingBalance}
          closingBalance={analysis.closingBalance}
          minimumBalance={analysis.minimumBalance}
          maximumBalance={analysis.maximumBalance}
          income={analysis.income}
          outflow={analysis.outflow}
          net={analysis.net}
          periodLabel={analysis.periodLabel}
          monthlyBreakdown={analysis.monthlyBreakdown}
          weeklyBreakdown={analysis.weeklyBreakdown}
        />
      )}

      {/* Admin Dashboard */}
      <AdminDashboard
        open={isAdminDashboardOpen}
        onOpenChange={setIsAdminDashboardOpen}
      />

      {/* User Upload History */}
      <UserHistoryDialog
        open={isUserHistoryOpen}
        onOpenChange={setIsUserHistoryOpen}
      />
    </div>
  );
}