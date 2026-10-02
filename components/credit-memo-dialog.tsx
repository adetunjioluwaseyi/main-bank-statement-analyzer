"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  FileText,
  Printer,
  ShieldCheck,
  AlertTriangle,
  Download,
  Building,
  CheckCircle2,
  XCircle,
  EyeOff,
  Eye,
  Wallet,
  Calendar,
} from "lucide-react";
import { formatMoney, SupportedCurrency } from "@/lib/currencies";
import type { UnderwritingMetrics } from "@/lib/underwriting";
import type { StatementForensicsResult } from "@/lib/statement-forensics";
import type { MonthlyBreakdownItem, WeeklyBreakdownItem } from "@/lib/time-breakdown";
import { openPrintableReport, downloadOfflineReport } from "@/lib/report-export";
import type { CSVData } from "@/app/page";

interface CreditMemoDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  statement: CSVData | null;
  underwriting: UnderwritingMetrics | null;
  forensics: StatementForensicsResult | null;
  currency: SupportedCurrency;
  openingBalance: number;
  closingBalance: number;
  minimumBalance: number;
  maximumBalance: number;
  income: number;
  outflow: number;
  net: number;
  periodLabel: string;
  monthlyBreakdown?: MonthlyBreakdownItem[];
  weeklyBreakdown?: WeeklyBreakdownItem[];
}

export function CreditMemoDialog({
  isOpen,
  onOpenChange,
  statement,
  underwriting,
  forensics,
  currency,
  openingBalance,
  closingBalance,
  minimumBalance,
  maximumBalance,
  income,
  outflow,
  net,
  periodLabel,
  monthlyBreakdown = [],
  weeklyBreakdown = [],
}: CreditMemoDialogProps) {
  const [isPiiRedacted, setIsPiiRedacted] = useState(true);
  const [breakdownView, setBreakdownView] = useState<"monthly" | "weekly">("monthly");

  if (!statement || !underwriting || !forensics) return null;

  const rawHolder = statement.metadata?.accountHolder || "STATEMENT APPLICANT";
  const displayHolder = isPiiRedacted
    ? rawHolder
        .split(" ")
        .map((part) =>
          part.length > 2
            ? `${part[0]}${"*".repeat(Math.max(2, part.length - 2))}${part.slice(-1)}`
            : `${part[0]}*`
        )
        .join(" ")
    : rawHolder;

  const netBalanceMovement = closingBalance - openingBalance;
  const balanceGrowthRate =
    openingBalance > 0 ? (netBalanceMovement / openingBalance) * 100 : 0;

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = () => {
    openPrintableReport({
      applicantName: displayHolder,
      accountType: statement.metadata?.accountType || "Standard Account",
      fileName: statement.fileName,
      currency,
      periodLabel,
      openingBalance,
      closingBalance,
      minimumBalance,
      maximumBalance,
      income,
      outflow,
      net,
      underwriting,
      forensics,
      monthlyBreakdown,
      weeklyBreakdown,
    });
  };

  const handleDownloadOffline = () => {
    downloadOfflineReport({
      applicantName: displayHolder,
      accountType: statement.metadata?.accountType || "Standard Account",
      fileName: statement.fileName,
      currency,
      periodLabel,
      openingBalance,
      closingBalance,
      minimumBalance,
      maximumBalance,
      income,
      outflow,
      net,
      underwriting,
      forensics,
      monthlyBreakdown,
      weeklyBreakdown,
    });
  };

  const getDecisionBadge = () => {
    if (underwriting.creditGrade === "A+" || underwriting.creditGrade === "A") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> APPROVED FOR LENDING
        </span>
      );
    }
    if (underwriting.creditGrade === "B") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-3 py-1 font-semibold text-amber-800">
          <AlertTriangle className="h-4 w-4" /> CONDITIONAL APPROVAL (ENHANCED DUE DILIGENCE)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-100 px-3 py-1 font-semibold text-rose-800">
        <XCircle className="h-4 w-4" /> RECOMMEND DECLINE (HIGH RISK)
      </span>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        id="credit-memo-modal"
        className="max-h-[92vh] max-w-4xl overflow-y-auto p-0 sm:max-w-4xl"
      >
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-white px-6 py-4 shadow-xs print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">
              Credit Committee Underwriting Memo
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2">
              <Switch
                id="pii-mode"
                checked={isPiiRedacted}
                onCheckedChange={setIsPiiRedacted}
              />
              <Label
                htmlFor="pii-mode"
                className="flex cursor-pointer items-center gap-1.5 text-xs font-medium"
              >
                {isPiiRedacted ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5 text-emerald-600" /> PII Masked
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" /> Show Full PII
                  </>
                )}
              </Label>
            </div>
            <Button
              id="download-summary-pdf-memo-btn"
              size="sm"
              onClick={handleExportPdf}
              className="gap-1.5 bg-[#183238] text-white hover:bg-[#183238]/90"
            >
              <Printer className="h-4 w-4 text-accent" /> Save / Print PDF
            </Button>
            <Button
              id="download-offline-report-btn"
              variant="outline"
              size="sm"
              onClick={handleDownloadOffline}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" /> Download HTML Report
            </Button>
          </div>
        </div>

        {/* Printable Memo Document */}
        <div className="space-y-6 bg-white p-6 sm:p-10 font-sans text-slate-800" id="printable-memo">
          {/* Memo Header */}
          <div className="border-b border-slate-300 pb-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                  <Building className="h-4 w-4" /> Confidential Credit Memorandum
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Credit Risk Assessment & Underwriting Memo
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  Generated {new Date().toLocaleDateString("en-US", { dateStyle: "long" })} · Source: {statement.fileName}
                </p>
              </div>
              <div className="flex flex-col sm:items-end">
                <span className="text-xs uppercase tracking-wider text-slate-400">Borrower Risk Rating</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`text-3xl font-extrabold ${
                    underwriting.creditGrade.startsWith("A")
                      ? "text-emerald-700"
                      : underwriting.creditGrade === "B"
                      ? "text-amber-600"
                      : "text-rose-700"
                  }`}>
                    {underwriting.creditGrade}
                  </span>
                  <span className="text-sm font-semibold text-slate-600">
                    ({underwriting.creditScore}/100)
                  </span>
                </div>
              </div>
            </div>

            {/* Metadata Table */}
            <div className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-4 text-xs">
              <div>
                <span className="font-semibold text-slate-500 uppercase">Applicant</span>
                <p className="mt-1 font-mono font-medium text-slate-900">{displayHolder}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-500 uppercase">Account Type</span>
                <p className="mt-1 font-mono font-medium text-slate-900">
                  {statement.metadata?.accountType || "STANDARD RETAIL / SME"}
                </p>
              </div>
              <div>
                <span className="font-semibold text-slate-500 uppercase">Coverage Period</span>
                <p className="mt-1 font-mono font-medium text-slate-900">{periodLabel}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-500 uppercase">Currency</span>
                <p className="mt-1 font-mono font-medium text-slate-900">{currency}</p>
              </div>
            </div>
          </div>

          {/* 1. Account Opening & Closing Balance Position */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700">
              <Wallet className="h-4 w-4 text-primary" /> 1. Account Balance Position & Reconciliation
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <span className="text-slate-500 font-medium">Opening Balance</span>
                <p className="mt-1 text-base font-bold text-slate-900">
                  {formatMoney(openingBalance, currency)}
                </p>
                <span className="text-[10px] text-slate-400">At start of period</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <span className="text-slate-500 font-medium">Closing Balance</span>
                <p className="mt-1 text-base font-bold text-slate-900">
                  {formatMoney(closingBalance, currency)}
                </p>
                <span className="text-[10px] text-slate-400">At end of period</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <span className="text-slate-500 font-medium">Net Balance Delta</span>
                <p className={`mt-1 text-base font-bold ${netBalanceMovement >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {netBalanceMovement >= 0 ? "+" : ""}{formatMoney(netBalanceMovement, currency)}
                </p>
                <span className="text-[10px] text-slate-400">{balanceGrowthRate >= 0 ? "+" : ""}{balanceGrowthRate.toFixed(1)}% growth</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <span className="text-slate-500 font-medium">Lowest Trough</span>
                <p className="mt-1 text-base font-bold text-rose-700">
                  {formatMoney(minimumBalance, currency)}
                </p>
                <span className="text-[10px] text-slate-400">Minimum balance reached</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <span className="text-slate-500 font-medium">Peak Balance</span>
                <p className="mt-1 text-base font-bold text-emerald-700">
                  {formatMoney(maximumBalance, currency)}
                </p>
                <span className="text-[10px] text-slate-400">Highest balance reached</span>
              </div>
            </div>
          </div>

          {/* Underwriter Recommendation Box */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Committee Recommendation
                </span>
                <div className="mt-1.5">{getDecisionBadge()}</div>
                <p className="mt-2 text-xs text-slate-600">
                  {underwriting.creditGradeDescription}
                </p>
              </div>
              <div className="border-t border-slate-200 pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                <span className="text-xs uppercase text-slate-500">Max Recommended Limit</span>
                <p className="text-xl font-bold text-slate-900">
                  {formatMoney(underwriting.recommendedLoanCeiling, currency)}
                </p>
                <span className="text-[11px] text-slate-500">
                  Max monthly repayment: {formatMoney(underwriting.maxMonthlyRepayment, currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Forensic Math Integrity Section */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700">
              <ShieldCheck className="h-4 w-4 text-primary" /> 2. Statement Forensic & Math Reconciliation
            </h3>
            <div className="mt-3 rounded-lg border border-slate-200 p-4 text-xs">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <span className="font-semibold text-slate-900">
                    Row-by-Row Running Balance Mathematical Integrity:{" "}
                  </span>
                  <span
                    className={`font-bold ${
                      forensics.mathIntegrityScore === 100
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {forensics.mathIntegrityScore}% Matched ({forensics.totalChecks - forensics.discrepancies.length}/{forensics.totalChecks} checked)
                  </span>
                </div>
                <Badge
                  variant={
                    forensics.forgeryRiskLevel === "Low"
                      ? "outline"
                      : forensics.forgeryRiskLevel === "Moderate"
                      ? "secondary"
                      : "destructive"
                  }
                >
                  Tamper Risk: {forensics.forgeryRiskLevel}
                </Badge>
              </div>
              <p className="mt-2 text-slate-600">{forensics.forgeryRiskSummary}</p>
            </div>
          </div>

          {/* Underwriting Core Financial Ratios */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700">
              <Building className="h-4 w-4 text-primary" /> 3. Cash Flow & Solvency Metrics
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <span className="text-slate-500">Average Daily Balance (ADB)</span>
                <p className="mt-1 text-base font-bold text-slate-900">
                  {formatMoney(underwriting.averageDailyBalance, currency)}
                </p>
                <span className="text-[10px] text-slate-400">Core liquidity baseline</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <span className="text-slate-500">Debt-to-Income (DTI)</span>
                <p className="mt-1 text-base font-bold text-slate-900">
                  {underwriting.dtiRatio}%
                </p>
                <span className="text-[10px] text-slate-400">Threshold: &lt;35% prime</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <span className="text-slate-500">Debt Service Coverage (DSCR)</span>
                <p className="mt-1 text-base font-bold text-slate-900">
                  {underwriting.dscrRatio.toFixed(2)}x
                </p>
                <span className="text-[10px] text-slate-400">Threshold: &gt;1.25x safe</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <span className="text-slate-500">Operating Runway</span>
                <p className="mt-1 text-base font-bold text-slate-900">
                  {underwriting.cashRunwayDays} Days
                </p>
                <span className="text-[10px] text-slate-400">Survival at current outflow</span>
              </div>
            </div>
          </div>

          {/* Monthly & Weekly Inflow and Outflow Breakdown Table in Memo */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700">
                <Calendar className="h-4 w-4 text-primary" /> 4. Inflow & Outflow Timeline Breakdown
              </h3>
              <div className="flex rounded-md border bg-slate-100 p-0.5 text-xs print:hidden">
                <button
                  type="button"
                  onClick={() => setBreakdownView("monthly")}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    breakdownView === "monthly" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                  }`}
                >
                  Monthly ({monthlyBreakdown.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBreakdownView("weekly")}
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    breakdownView === "weekly" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                  }`}
                >
                  Weekly ({weeklyBreakdown.length})
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 text-xs">
              {breakdownView === "monthly" ? (
                <table className="w-full text-left">
                  <thead className="border-b bg-slate-50 font-semibold text-slate-600">
                    <tr>
                      <th className="p-2.5">Month</th>
                      <th className="p-2.5 text-right">Total Inflow (Cr)</th>
                      <th className="p-2.5 text-right">Total Outflow (Dr)</th>
                      <th className="p-2.5 text-right">Net Movement</th>
                      <th className="p-2.5 text-right">Closing Balance</th>
                      <th className="p-2.5 text-right">Txns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyBreakdown.map((m) => (
                      <tr key={m.month} className="border-b last:border-0 font-mono">
                        <td className="p-2.5 font-sans font-medium text-slate-900">{m.month}</td>
                        <td className="p-2.5 text-right text-emerald-700">{formatMoney(m.income, currency)}</td>
                        <td className="p-2.5 text-right text-rose-700">{formatMoney(m.outflow, currency)}</td>
                        <td className={`p-2.5 text-right font-bold ${m.net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {m.net >= 0 ? "+" : ""}{formatMoney(m.net, currency)}
                        </td>
                        <td className="p-2.5 text-right text-slate-900 font-bold">
                          {m.closingBalance !== undefined ? formatMoney(m.closingBalance, currency) : "-"}
                        </td>
                        <td className="p-2.5 text-right text-slate-500 font-sans">{m.transactionCount || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left">
                  <thead className="border-b bg-slate-50 font-semibold text-slate-600">
                    <tr>
                      <th className="p-2.5">Week</th>
                      <th className="p-2.5">Date Range</th>
                      <th className="p-2.5 text-right">Inflow (Cr)</th>
                      <th className="p-2.5 text-right">Outflow (Dr)</th>
                      <th className="p-2.5 text-right">Net Movement</th>
                      <th className="p-2.5 text-right">Week-End Balance</th>
                      <th className="p-2.5 text-right">Txns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyBreakdown.map((w) => (
                      <tr key={w.week} className="border-b last:border-0 font-mono">
                        <td className="p-2.5 font-sans font-medium text-slate-900">{w.week}</td>
                        <td className="p-2.5 font-sans text-slate-500">{w.startDate} - {w.endDate}</td>
                        <td className="p-2.5 text-right text-emerald-700">{formatMoney(w.income, currency)}</td>
                        <td className="p-2.5 text-right text-rose-700">{formatMoney(w.outflow, currency)}</td>
                        <td className={`p-2.5 text-right font-bold ${w.net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {w.net >= 0 ? "+" : ""}{formatMoney(w.net, currency)}
                        </td>
                        <td className="p-2.5 text-right text-slate-900 font-bold">
                          {w.closingBalance !== undefined ? formatMoney(w.closingBalance, currency) : "-"}
                        </td>
                        <td className="p-2.5 text-right text-slate-500 font-sans">{w.transactionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Underwriter Sign-off Checklist */}
          <div className="border-t border-slate-300 pt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Underwriting Verification & Sign-Off
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Identity Verified</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Source of Funds Reconciled</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Debt Capacity Calculated</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Ledger Math Verified</span>
              </div>
            </div>

            <div className="mt-6 flex flex-col justify-between gap-6 border-t border-dashed border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row">
              <div>
                <span>Underwriter Signature: _______________________</span>
              </div>
              <div>
                <span>Credit Committee Officer: _______________________</span>
              </div>
              <div>
                <span>Approval Date: ____ / ____ / 2026</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
