"use client";

import React, { useState, useMemo } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Scale,
  Building,
  Banknote,
  Receipt,
  Dices,
  FileText,
  Sliders,
  Filter,
  ArrowRight,
  Info,
  Calendar,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Clock,
  Sparkles,
  Percent,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatMoney, SupportedCurrency } from "@/lib/currencies";
import type { UnderwritingMetrics } from "@/lib/underwriting";
import type { StatementForensicsResult } from "@/lib/statement-forensics";
import type { CSVData } from "@/app/page";

interface LenderDashboardProps {
  statement: CSVData | null;
  underwriting: UnderwritingMetrics;
  forensics: StatementForensicsResult;
  currency: SupportedCurrency;
  openingBalance: number;
  closingBalance: number;
  income: number;
  outflow: number;
  net: number;
  periodLabel: string;
  monthlyBreakdown: { month: string; income: number; outflow: number; net: number }[];
  onOpenCreditMemo: () => void;
}

export function LenderDashboard({
  statement,
  underwriting,
  forensics,
  currency,
  openingBalance,
  closingBalance,
  income: grossInflow,
  outflow,
  net,
  periodLabel,
  monthlyBreakdown,
  onOpenCreditMemo,
}: LenderDashboardProps) {
  // Tabs: overview | reconciliation | genuine-income | fraud-circular | behavioral | simulator
  const [activeTab, setActiveTab] = useState<
    "overview" | "reconciliation" | "genuine-income" | "fraud-circular" | "behavioral" | "simulator"
  >("overview");

  // Reconciliation table filter: "all" | "reconciled" | "discrepancies"
  const [reconFilter, setReconFilter] = useState<"all" | "reconciled" | "discrepancies">("all");

  // Interactive loan simulator parameters
  const [simLoanAmount, setSimLoanAmount] = useState<number>(
    Math.max(10000, Math.round(underwriting.recommendedLoanCeiling * 0.8))
  );
  const [simTenorMonths, setSimTenorMonths] = useState<number>(underwriting.verdict.recommendedTenorMonths || 6);
  const [simInterestRateAnnual, setSimInterestRateAnnual] = useState<number>(24); // 24% annual

  // Completed stipulation checkboxes
  const [completedConditions, setCompletedConditions] = useState<Record<number, boolean>>({});

  // Loan simulation math
  const simMonthlyRate = simInterestRateAnnual / 100 / 12;
  const simMonthlyInstallment = useMemo(() => {
    if (simMonthlyRate <= 0) return Math.round(simLoanAmount / simTenorMonths);
    const emi =
      (simLoanAmount * simMonthlyRate * Math.pow(1 + simMonthlyRate, simTenorMonths)) /
      (Math.pow(1 + simMonthlyRate, simTenorMonths) - 1);
    return Math.round(emi);
  }, [simLoanAmount, simMonthlyRate, simTenorMonths]);

  const simPostLoanDti = useMemo(() => {
    const monthlyGenuine = underwriting.genuineIncome.genuineOperatingIncome / Math.max(1, monthlyBreakdown.length);
    if (monthlyGenuine <= 0) return 100;
    const totalMonthlyDebt = (underwriting.paydayLoanExposure.totalRepayments / Math.max(1, monthlyBreakdown.length)) + simMonthlyInstallment;
    return Math.min(100, Math.round((totalMonthlyDebt / monthlyGenuine) * 100));
  }, [underwriting, monthlyBreakdown, simMonthlyInstallment]);

  const simPostLoanDscr = useMemo(() => {
    const monthlyGenuine = underwriting.genuineIncome.genuineOperatingIncome / Math.max(1, monthlyBreakdown.length);
    const totalMonthlyDebt = (underwriting.paydayLoanExposure.totalRepayments / Math.max(1, monthlyBreakdown.length)) + simMonthlyInstallment;
    if (totalMonthlyDebt <= 0) return 5.0;
    return Math.round((monthlyGenuine / totalMonthlyDebt) * 100) / 100;
  }, [underwriting, monthlyBreakdown, simMonthlyInstallment]);

  // Filtered reconciliation rows
  const filteredAuditedRows = useMemo(() => {
    if (reconFilter === "reconciled") {
      return forensics.auditedRows.filter((r) => r.isReconciled);
    }
    if (reconFilter === "discrepancies") {
      return forensics.auditedRows.filter((r) => !r.isReconciled);
    }
    return forensics.auditedRows;
  }, [forensics.auditedRows, reconFilter]);

  const verdict = underwriting.verdict;
  const genuine = underwriting.genuineIncome;
  const proof = forensics.reconciliationProof;

  return (
    <div className="space-y-6">
      {/* 1. TOP EXECUTIVE LENDER TERMINAL HEADER */}
      <div className="rounded-2xl border border-border/80 bg-gradient-to-r from-[#183238] via-[#1e3e46] to-[#183238] p-5 text-white shadow-md sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-accent uppercase">
              <Building className="h-4 w-4" />
              <span>Institutional Underwriting Terminal · Credit Committee Mode</span>
            </div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {statement?.metadata?.accountHolder || "Borrower Statement Analysis"}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/70">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-accent" />
                Period: {periodLabel}
              </span>
              <span>•</span>
              <span>{statement?.metadata?.accountType || "Commercial / Retail Account"}</span>
              {statement?.metadata?.accountNumber && (
                <>
                  <span>•</span>
                  <span>Acct: {statement.metadata.accountNumber}</span>
                </>
              )}
              <span>•</span>
              <span className="font-mono text-white/90">Source: {statement?.fileName || "Ingested File"}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Verdict Badge */}
            <div
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold shadow-inner ${
                verdict.decision === "APPROVED"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : verdict.decision === "CONDITIONAL_APPROVAL"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
              }`}
            >
              {verdict.decision === "APPROVED" && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
              {verdict.decision === "CONDITIONAL_APPROVAL" && <AlertTriangle className="h-5 w-5 text-amber-400" />}
              {verdict.decision === "DECLINED" && <XCircle className="h-5 w-5 text-rose-400" />}
              <div className="leading-tight">
                <div className="text-[10px] tracking-wider uppercase opacity-80">Committee Verdict</div>
                <div>{verdict.decision.replace("_", " ")}</div>
              </div>
            </div>

            <Button
              id="lender-open-memo-btn"
              onClick={onOpenCreditMemo}
              className="bg-accent text-primary hover:bg-accent/90 h-10 gap-2 text-xs font-semibold"
            >
              <FileText className="h-4 w-4" /> Generate Credit Memo
            </Button>
          </div>
        </div>

        {/* Executive Quick Stats Strip */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 sm:grid-cols-4 lg:grid-cols-5 text-xs">
          <div>
            <span className="text-white/60">Credit Score</span>
            <p className="text-lg font-bold text-white">
              {underwriting.institutionalScore}{" "}
              <span className="text-xs font-semibold text-accent">Grade {underwriting.creditGrade}</span>
            </p>
            <span className="text-[11px] text-white/50">{underwriting.riskTier} Tier</span>
          </div>

          <div>
            <span className="text-white/60">Reconciliation Rate</span>
            <p
              className={`text-lg font-bold ${
                proof.is100PercentReconciled ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {proof.reconciliationRate}%{" "}
              <span className="text-xs font-semibold">
                {proof.is100PercentReconciled ? "100% Match" : `${proof.breakCount} Breaks`}
              </span>
            </p>
            <span className="text-[11px] text-white/50">
              {proof.reconciledCount} of {proof.totalChecks} rows verified
            </span>
          </div>

          <div>
            <span className="text-white/60">Genuine Operating Income</span>
            <p className="text-lg font-bold text-emerald-300">
              {formatMoney(genuine.genuineOperatingIncome, currency)}
            </p>
            <span className="text-[11px] text-white/50">
              {genuine.incomeQualityRatio}% of {formatMoney(grossInflow, currency)} gross
            </span>
          </div>

          <div>
            <span className="text-white/60">Circular & Wash Fraud</span>
            <p
              className={`text-lg font-bold ${
                forensics.circularTransfers.length === 0 ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {forensics.circularTransfers.length === 0
                ? "0 Flags (Clean)"
                : `${forensics.circularTransfers.length} Wash Loops`}
            </p>
            <span className="text-[11px] text-white/50">
              {forensics.circularTransfers.length === 0 ? "No mule velocity" : "Rapid fund pass-through"}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-4 lg:col-span-1">
            <span className="text-white/60">Recommended Limit</span>
            <p className="text-lg font-bold text-accent">
              {formatMoney(underwriting.recommendedLoanCeiling, currency)}
            </p>
            <span className="text-[11px] text-white/50">
              Safe EMI: {formatMoney(underwriting.maxMonthlyRepayment, currency)}/mo
            </span>
          </div>
        </div>
      </div>

      {/* 2. LENDER NAVIGATION TABS */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 pb-2">
        <Button
          variant={activeTab === "overview" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("overview")}
          className="gap-1.5 text-xs"
        >
          <Scale className="h-3.5 w-3.5" /> Executive Verdict & Policy
        </Button>

        <Button
          variant={activeTab === "reconciliation" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("reconciliation")}
          className="gap-1.5 text-xs relative"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          100% Ledger Reconciliation
          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-emerald-100 text-emerald-800">
            {proof.reconciliationRate}%
          </Badge>
        </Button>

        <Button
          variant={activeTab === "genuine-income" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("genuine-income")}
          className="gap-1.5 text-xs"
        >
          <ArrowDownRight className="h-3.5 w-3.5 text-emerald-600" />
          Genuine-Income Detection
          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
            {genuine.incomeQualityRatio}%
          </Badge>
        </Button>

        <Button
          variant={activeTab === "fraud-circular" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("fraud-circular")}
          className="gap-1.5 text-xs"
        >
          <AlertTriangle
            className={`h-3.5 w-3.5 ${
              forensics.circularTransfers.length > 0 ? "text-rose-600" : "text-muted-foreground"
            }`}
          />
          Fraud & Circular-Transfer
          {forensics.circularTransfers.length > 0 && (
            <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-[10px]">
              {forensics.circularTransfers.length}
            </Badge>
          )}
        </Button>

        <Button
          variant={activeTab === "behavioral" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("behavioral")}
          className="gap-1.5 text-xs"
        >
          <Dices className="h-3.5 w-3.5 text-amber-600" />
          Behavioral & Merchant Triage
        </Button>

        <Button
          variant={activeTab === "simulator" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("simulator")}
          className="gap-1.5 text-xs"
        >
          <Sliders className="h-3.5 w-3.5 text-primary" />
          Facility Structuring Simulator
        </Button>
      </div>

      {/* 3. TAB 1: EXECUTIVE VERDICT & POLICY CHECKS */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Executive Verdict Summary Card */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="border-b border-border/70 bg-[#fbfcfb] pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building className="h-4 w-4 text-primary" />
                    Automated Underwriting Recommendation & Decision Narrative
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Synthesized from cash solvency, 100% reconciliation, genuine income quality, and anti-fraud heuristics.
                  </CardDescription>
                </div>
                <Badge
                  className={`text-xs px-3 py-1 font-bold ${
                    verdict.decision === "APPROVED"
                      ? "bg-emerald-100 text-emerald-800"
                      : verdict.decision === "CONDITIONAL_APPROVAL"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {verdict.decision.replace("_", " ")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="rounded-xl border border-border/80 bg-muted/30 p-4 text-sm leading-relaxed text-foreground">
                <p className="font-semibold text-foreground">Underwriting Committee Findings:</p>
                <p className="mt-1 text-muted-foreground">{verdict.verdictSummary}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Recommended Facility Limit:</span>{" "}
                    <span className="font-bold text-primary">{formatMoney(verdict.recommendedFacility, currency)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Max Safe Monthly Repayment:</span>{" "}
                    <span className="font-bold text-foreground">
                      {formatMoney(verdict.maxSafeMonthlyInstallment, currency)}/mo
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Standard Tenor:</span>{" "}
                    <span className="font-bold text-foreground">{verdict.recommendedTenorMonths} Months</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Suggested Pricing Spread:</span>{" "}
                    <span className="font-bold text-foreground">{verdict.suggestedRateSpread}</span>
                  </div>
                </div>
              </div>

              {/* Hard Policy Rule Matrix */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Institutional Policy Gate Matrix (6 Mandatory Gates)
                </h4>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {verdict.policyChecks.map((check, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl border p-3.5 text-xs transition-all ${
                        check.status === "PASSED"
                          ? "border-emerald-200 bg-emerald-50/20"
                          : check.status === "FLAGGED"
                          ? "border-amber-200 bg-amber-50/20"
                          : "border-rose-200 bg-rose-50/20"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-foreground">{check.rule}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            check.status === "PASSED"
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                              : check.status === "FLAGGED"
                              ? "bg-amber-100 text-amber-800 border-amber-200"
                              : "bg-rose-100 text-rose-800 border-rose-200"
                          }`}
                        >
                          {check.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">{check.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conditions Precedent & Stipulations */}
              {verdict.conditions.length > 0 && (
                <div className="rounded-xl border border-border/80 bg-white p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Required Underwriter Stipulations & Covenants ({verdict.conditions.length})
                  </h4>
                  <div className="space-y-2 text-xs">
                    {verdict.conditions.map((cond, index) => (
                      <label
                        key={index}
                        className="flex items-start gap-2.5 cursor-pointer rounded-lg p-2 hover:bg-muted/40 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={!!completedConditions[index]}
                          onChange={(e) =>
                            setCompletedConditions((prev) => ({ ...prev, [index]: e.target.checked }))
                          }
                          className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                        />
                        <span
                          className={`${
                            completedConditions[index] ? "line-through text-muted-foreground" : "text-foreground"
                          }`}
                        >
                          {cond}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 4 Pillars of Institutional Credit Score */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(underwriting.scorePillars).map(([key, pillar]) => (
              <Card key={key} className="border-border/80 shadow-xs">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{pillar.label}</CardTitle>
                    <span className="font-mono text-xs font-bold text-foreground">
                      {pillar.score}/{pillar.max} pts
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pillar.score >= 20 ? "bg-emerald-600" : pillar.score >= 14 ? "bg-amber-500" : "bg-rose-500"
                      }`}
                      style={{ width: `${(pillar.score / pillar.max) * 100}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">{pillar.detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 4. TAB 2: 100% TRANSACTION RECONCILIATION COMMAND CENTER */}
      {activeTab === "reconciliation" && (
        <div className="space-y-6">
          {/* Mathematical Proof Box */}
          <Card
            className={`border-2 shadow-xs ${
              proof.is100PercentReconciled
                ? "border-emerald-300 bg-emerald-50/20"
                : "border-rose-300 bg-rose-50/20"
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck
                    className={`h-5 w-5 ${
                      proof.is100PercentReconciled ? "text-emerald-600" : "text-rose-600"
                    }`}
                  />
                  <CardTitle className="text-base">100% Transaction Reconciliation & Mathematical Proof</CardTitle>
                </div>
                <Badge
                  className={`text-xs px-3 py-1 font-bold ${
                    proof.is100PercentReconciled
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-rose-100 text-rose-800 border-rose-300"
                  }`}
                >
                  {proof.is100PercentReconciled ? "100.0% RECONCILED (ZERO LEAKAGE)" : `${proof.breakCount} BREAKS DETECTED`}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Verifies complete double-entry continuity across all statement lines. Equation:{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                  Opening Balance + Sum(Credits) - Sum(Debits) = Closing Balance
                </code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Grand Proof Formula Visualizer */}
              <div className="rounded-xl border border-border/80 bg-white p-4 shadow-2xs">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-5 text-center text-xs">
                  <div className="p-2 rounded-lg bg-slate-50 border">
                    <span className="text-muted-foreground block text-[11px]">Opening Balance</span>
                    <span className="text-base font-bold text-foreground">
                      {formatMoney(proof.openingBalance, currency)}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-200">
                    <span className="text-emerald-800 block text-[11px]">+ Total Credits</span>
                    <span className="text-base font-bold text-emerald-700">
                      +{formatMoney(proof.totalCredits, currency)}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-rose-50/50 border border-rose-200">
                    <span className="text-rose-800 block text-[11px]">- Total Debits</span>
                    <span className="text-base font-bold text-rose-700">
                      -{formatMoney(proof.totalDebits, currency)}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-50 border">
                    <span className="text-muted-foreground block text-[11px]">= Expected Closing</span>
                    <span className="text-base font-bold text-foreground">
                      {formatMoney(proof.expectedClosingBalance, currency)}
                    </span>
                  </div>

                  <div
                    className={`p-2 rounded-lg border ${
                      proof.closingVariance === 0
                        ? "bg-emerald-100/50 border-emerald-300"
                        : "bg-rose-100/50 border-rose-300"
                    }`}
                  >
                    <span className="block text-[11px] font-semibold text-foreground">Variance Delta</span>
                    <span
                      className={`text-base font-extrabold ${
                        proof.closingVariance === 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {proof.closingVariance === 0 ? "$0.00 Exact" : formatMoney(proof.closingVariance, currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Row-Level Filter Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2 text-xs">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground font-medium">Filter Audit Rows:</span>
                  <button
                    type="button"
                    onClick={() => setReconFilter("all")}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      reconFilter === "all" ? "bg-primary text-white font-semibold" : "bg-muted text-foreground hover:bg-muted/80"
                    }`}
                  >
                    All Rows ({forensics.auditedRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setReconFilter("reconciled")}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      reconFilter === "reconciled" ? "bg-emerald-700 text-white font-semibold" : "bg-muted text-foreground hover:bg-muted/80"
                    }`}
                  >
                    Reconciled ({proof.reconciledCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setReconFilter("discrepancies")}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      reconFilter === "discrepancies" ? "bg-rose-700 text-white font-semibold" : "bg-muted text-foreground hover:bg-muted/80"
                    }`}
                  >
                    Discrepancy Breaks ({proof.breakCount})
                  </button>
                </div>

                <span className="text-xs text-muted-foreground">
                  Showing {filteredAuditedRows.length} audited transaction rows
                </span>
              </div>

              {/* Detailed Line-by-Line Audit Table */}
              <div className="overflow-x-auto rounded-xl border border-border/80 bg-white">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3">Row #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-right">Debit (-)</th>
                      <th className="py-2.5 px-3 text-right">Credit (+)</th>
                      <th className="py-2.5 px-3 text-right">Expected Bal</th>
                      <th className="py-2.5 px-3 text-right">Stated Bal</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuditedRows.slice(0, 25).map((row) => (
                      <tr
                        key={row.rowIndex}
                        className={`border-b last:border-0 font-mono hover:bg-slate-50/60 ${
                          !row.isReconciled ? "bg-rose-50/40 text-rose-950" : ""
                        }`}
                      >
                        <td className="py-2 px-3 font-bold text-muted-foreground">#{row.rowIndex}</td>
                        <td className="py-2 px-3 font-sans text-muted-foreground">{row.date}</td>
                        <td className="py-2 px-3 font-sans max-w-[220px] truncate text-foreground">
                          {row.description}
                        </td>
                        <td className="py-2 px-3 text-right text-rose-600 font-medium">
                          {row.debit > 0 ? formatMoney(row.debit, currency) : "-"}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-700 font-medium">
                          {row.credit > 0 ? formatMoney(row.credit, currency) : "-"}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {formatMoney(row.expectedBalance, currency)}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            !row.isReconciled ? "text-rose-700 underline" : "text-foreground"
                          }`}
                        >
                          {row.statedBalance > 0 ? formatMoney(row.statedBalance, currency) : "-"}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {row.isReconciled ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Reconciled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                              <XCircle className="h-3 w-3" /> Break (Δ {formatMoney(row.variance, currency)})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 5. TAB 3: GENUINE INCOME DECONSTRUCTION */}
      {activeTab === "genuine-income" && (
        <div className="space-y-6">
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="border-b border-border/70 bg-[#fbfcfb] pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ArrowDownRight className="h-5 w-5 text-emerald-600" />
                    Genuine Operating Income vs Gross Inflow Deconstruction
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Institutional underwriters must eliminate loan disbursements, self-transfers, and refunds from debt-service capacity.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-xs font-semibold">
                  Income Quality: {genuine.incomeQualityRatio}% Verified
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-6">
              {/* Gross vs Genuine Waterfall Cards */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border/80 bg-white p-4 shadow-2xs">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">Gross Incoming Deposits</span>
                  <p className="mt-1 text-2xl font-bold text-foreground">{formatMoney(genuine.grossInflows, currency)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">All money in across period</p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 shadow-2xs">
                  <span className="text-xs font-semibold text-amber-800 uppercase">Non-Income Exclusions</span>
                  <p className="mt-1 text-2xl font-bold text-amber-700">-{formatMoney(genuine.nonIncomeInflows, currency)}</p>
                  <p className="mt-1 text-[11px] text-amber-900/70">
                    Loans, self-transfers, and refunds
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 shadow-2xs">
                  <span className="text-xs font-semibold text-emerald-800 uppercase">Verified Genuine Income</span>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">
                    {formatMoney(genuine.genuineOperatingIncome, currency)}
                  </p>
                  <p className="mt-1 text-[11px] text-emerald-900/70">
                    Basis for debt-service calculation
                  </p>
                </div>
              </div>

              {/* Waterfall Itemized Exclusions Breakdown */}
              <div className="rounded-xl border border-border/80 bg-white p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Inflow Deconstruction Waterfall (Disallowed Deposits)
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                  <div className="rounded-lg border p-3 bg-slate-50/60">
                    <span className="text-muted-foreground">Loan Disbursements Excluded</span>
                    <p className="mt-1 text-base font-bold text-rose-700">
                      {formatMoney(genuine.excludedBreakdown.loanDisbursements, currency)}
                    </p>
                    <span className="text-[11px] text-muted-foreground">Payday apps & borrowed liquidity</span>
                  </div>

                  <div className="rounded-lg border p-3 bg-slate-50/60">
                    <span className="text-muted-foreground">Internal Self-Transfers Excluded</span>
                    <p className="mt-1 text-base font-bold text-slate-700">
                      {formatMoney(genuine.excludedBreakdown.internalSelfTransfers, currency)}
                    </p>
                    <span className="text-[11px] text-muted-foreground">Own-account movements</span>
                  </div>

                  <div className="rounded-lg border p-3 bg-slate-50/60">
                    <span className="text-muted-foreground">Reversals & Refunds Excluded</span>
                    <p className="mt-1 text-base font-bold text-slate-700">
                      {formatMoney(genuine.excludedBreakdown.reversalsAndRefunds, currency)}
                    </p>
                    <span className="text-[11px] text-muted-foreground">Failed transaction chargebacks</span>
                  </div>

                  <div className="rounded-lg border p-3 bg-slate-50/60">
                    <span className="text-muted-foreground">Betting & Gambling Cash-ins</span>
                    <p className="mt-1 text-base font-bold text-amber-700">
                      {formatMoney(genuine.excludedBreakdown.gamblingOrP2pCashin, currency)}
                    </p>
                    <span className="text-[11px] text-muted-foreground">Non-operational windfalls</span>
                  </div>
                </div>
              </div>

              {/* Identified Recurring Income Streams */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Identified Employer & Recurring Revenue Streams
                </h4>
                {genuine.detectedStreams.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-border/80 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40 text-muted-foreground font-semibold">
                          <th className="py-2.5 px-3">Remitter / Employer</th>
                          <th className="py-2.5 px-3">Category Type</th>
                          <th className="py-2.5 px-3">Cadence Regularity</th>
                          <th className="py-2.5 px-3 text-right">Deposits</th>
                          <th className="py-2.5 px-3 text-right">Total Verified</th>
                          <th className="py-2.5 px-3 text-center">Stability</th>
                        </tr>
                      </thead>
                      <tbody>
                        {genuine.detectedStreams.map((stream, idx) => (
                          <tr key={idx} className="border-b last:border-0 hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-semibold text-foreground">{stream.source}</td>
                            <td className="py-2 px-3">
                              <Badge variant="outline" className="text-[10px]">
                                {stream.type}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">{stream.cadence}</td>
                            <td className="py-2 px-3 text-right font-mono">{stream.transactionCount}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                              {formatMoney(stream.totalReceived, currency)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <Badge
                                className={`text-[10px] ${
                                  stream.consistencyScore >= 70
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {stream.consistencyScore}%
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-xl border p-4 text-center text-xs text-muted-foreground">
                    No recurring institutional payroll markers identified. Deposits appear irregular or non-salaried.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 6. TAB 4: FRAUD & CIRCULAR-TRANSFER MONITOR */}
      {activeTab === "fraud-circular" && (
        <div className="space-y-6">
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="border-b border-border/70 bg-[#fbfcfb] pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-rose-600" />
                    Anti-Fraud, Circular-Transfer & Pass-Through Mule Velocity Monitor
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Detects artificial turnover manipulation, wash trading, pass-through mule behavior, and end-of-period window dressing.
                  </CardDescription>
                </div>
                <Badge
                  variant={forensics.circularTransfers.length === 0 ? "outline" : "destructive"}
                  className="text-xs font-semibold px-3 py-1"
                >
                  {forensics.circularTransfers.length === 0 ? "CLEAN · 0 FLAGS" : `${forensics.circularTransfers.length} SUSPICIOUS FLOWS`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-6">
              {/* Circular Transfers & Rapid Wash Radar */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Circular Transfer & Rapid Wash Detection Radar
                </h4>
                {forensics.circularTransfers.length > 0 ? (
                  <div className="space-y-3">
                    {forensics.circularTransfers.map((circ, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-rose-200 bg-rose-50/30 p-4 text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <Badge
                            className={`text-[10px] font-bold ${
                              circ.riskSeverity === "Critical"
                                ? "bg-rose-700 text-white"
                                : circ.riskSeverity === "High"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {circ.riskCategory} · {circ.riskSeverity} Risk
                          </Badge>
                          <span className="font-mono text-rose-800 font-bold">
                            {circ.drainPercentage}% Drained Within {circ.turnaroundHops} Transaction(s)
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1 font-mono">
                          <div className="rounded-lg bg-white p-2.5 border border-rose-100">
                            <span className="text-muted-foreground text-[10px] block">Inflow Deposit Event:</span>
                            <span className="text-emerald-700 font-bold">{formatMoney(circ.inflowAmount, currency)}</span>
                            <span className="text-muted-foreground text-[11px] block truncate font-sans">
                              {circ.inflowDate} · {circ.inflowDesc}
                            </span>
                          </div>

                          <div className="rounded-lg bg-white p-2.5 border border-rose-100">
                            <span className="text-muted-foreground text-[10px] block">Matching Rapid Outflow:</span>
                            <span className="text-rose-700 font-bold">-{formatMoney(circ.outflowAmount, currency)}</span>
                            <span className="text-muted-foreground text-[11px] block truncate font-sans">
                              {circ.outflowDate} · {circ.outflowDesc}
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Funds arrived and were liquidated almost immediately. This is a primary indicator of artificial volume generation (wash trading) or an intermediary money mule account.
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/20 p-5 text-center text-xs">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-1.5" />
                    <span className="font-bold text-emerald-900 block">No Circular Transfers or Wash Inflows Detected</span>
                    <span className="text-emerald-800/80 text-[11px]">
                      Deposited funds exhibit organic dwell time and retention in the account.
                    </span>
                  </div>
                )}
              </div>

              {/* Balance Pump-and-Dump (Window Dressing) Alerts */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Cut-Off Date Balance Pump-and-Dump (Window Dressing)
                </h4>
                {forensics.balanceInflation.length > 0 ? (
                  <div className="space-y-2">
                    {forensics.balanceInflation.map((pump, idx) => (
                      <div key={idx} className="rounded-xl border border-amber-300 bg-amber-50/30 p-3.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-900">
                            {pump.depositDate} · {pump.inflationImpact}
                          </span>
                          <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-[10px]">
                            {formatMoney(pump.amount, currency)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground text-[11px]">{pump.note}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border p-4 text-center text-xs text-muted-foreground">
                    No abnormal end-of-period balance pumping detected. Closing balance reflects normalized account activity.
                  </div>
                )}
              </div>

              {/* Structuring / Smurfing Flags */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  AML Structuring / Smurfing Radar (Clustering Under Regulatory Limits)
                </h4>
                {forensics.structuringAlerts.length > 0 ? (
                  <div className="rounded-xl border border-border/80 bg-white overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40 text-muted-foreground font-semibold">
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Description</th>
                          <th className="py-2 px-3">Flow</th>
                          <th className="py-2 px-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forensics.structuringAlerts.map((st, idx) => (
                          <tr key={idx} className="border-b last:border-0 font-mono">
                            <td className="py-2 px-3 font-sans">{st.date}</td>
                            <td className="py-2 px-3 font-sans truncate max-w-[200px]">{st.description}</td>
                            <td className="py-2 px-3 capitalize">{st.type}</td>
                            <td className="py-2 px-3 text-right font-bold text-amber-700">
                              {formatMoney(st.amount, currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-xl border p-4 text-center text-xs text-muted-foreground">
                    No structuring patterns detected below regulatory thresholds.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 7. TAB 5: BEHAVIORAL & MERCHANT TRIAGE */}
      {activeTab === "behavioral" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Gambling */}
            <Card
              className={`border shadow-xs ${
                underwriting.gamblingExposure.count > 0 ? "border-amber-300 bg-amber-50/20" : "border-border/80"
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Gambling & Betting</span>
                    <p className="mt-1 text-xl font-bold text-foreground">
                      {formatMoney(underwriting.gamblingExposure.totalSpent, currency)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {underwriting.gamblingExposure.count} wager(s) ({underwriting.gamblingExposure.percentOfOutflow}% of outflows)
                    </p>
                  </div>
                  <div className="rounded-lg bg-amber-100 p-2 text-amber-800">
                    <Dices className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payday apps */}
            <Card
              className={`border shadow-xs ${
                underwriting.paydayLoanExposure.appCount > 0 ? "border-rose-300 bg-rose-50/20" : "border-border/80"
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Payday / Micro-Loans</span>
                    <p className="mt-1 text-xl font-bold text-foreground">
                      {underwriting.paydayLoanExposure.appCount} App(s) Active
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {underwriting.paydayLoanExposure.detectedApps.length > 0
                        ? underwriting.paydayLoanExposure.detectedApps.join(", ")
                        : "No predatory debt stacking"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-rose-100 p-2 text-rose-800">
                    <Building className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* NSF */}
            <Card
              className={`border shadow-xs ${
                underwriting.nsfAndPenalties.count > 0 ? "border-rose-300 bg-rose-50/20" : "border-border/80"
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase">NSF / Bounced Penalties</span>
                    <p className="mt-1 text-xl font-bold text-foreground">
                      {underwriting.nsfAndPenalties.count} Incident(s)
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatMoney(underwriting.nsfAndPenalties.totalAmount, currency)} in dishonored penalty fees
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-100 p-2 text-slate-800">
                    <Receipt className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Solvency ratios deep dive */}
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="border-b border-border/70 bg-[#fbfcfb] pb-4">
              <CardTitle className="text-base">Institutional Solvency Ratios & Liquidity Runway</CardTitle>
              <CardDescription className="text-xs">
                Key regulatory metrics used by risk committees to evaluate capacity.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border p-3.5 bg-slate-50/50">
                <span className="text-muted-foreground text-xs block">Average Daily Balance (ADB)</span>
                <span className="text-lg font-bold text-foreground block mt-1">
                  {formatMoney(underwriting.averageDailyBalance, currency)}
                </span>
                <span className="text-[11px] text-muted-foreground">Weighted core liquidity buffer</span>
              </div>

              <div className="rounded-xl border p-3.5 bg-slate-50/50">
                <span className="text-muted-foreground text-xs block">Debt-to-Income (DTI)</span>
                <span className={`text-lg font-bold block mt-1 ${underwriting.dtiRatio > 40 ? "text-rose-700" : "text-emerald-700"}`}>
                  {underwriting.dtiRatio}%
                </span>
                <span className="text-[11px] text-muted-foreground">Debt obligations as % of genuine income</span>
              </div>

              <div className="rounded-xl border p-3.5 bg-slate-50/50">
                <span className="text-muted-foreground text-xs block">Debt Service Coverage (DSCR)</span>
                <span className={`text-lg font-bold block mt-1 ${underwriting.dscrRatio >= 1.25 ? "text-emerald-700" : "text-amber-700"}`}>
                  {underwriting.dscrRatio.toFixed(2)}x
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {underwriting.dscrRatio >= 1.25 ? "Safe coverage margin (>1.25x)" : "Tight debt coverage"}
                </span>
              </div>

              <div className="rounded-xl border p-3.5 bg-slate-50/50">
                <span className="text-muted-foreground text-xs block">Fixed Obligation Ratio (FOIR)</span>
                <span className="text-lg font-bold text-foreground block mt-1">
                  {underwriting.foirRatio}%
                </span>
                <span className="text-[11px] text-muted-foreground">Debt + fixed bills commitments</span>
              </div>

              <div className="rounded-xl border p-3.5 bg-slate-50/50">
                <span className="text-muted-foreground text-xs block">Cash Runway Survival</span>
                <span className="text-lg font-bold text-foreground block mt-1">
                  {underwriting.cashRunwayDays} Days
                </span>
                <span className="text-[11px] text-muted-foreground">Survival days at current outflow velocity</span>
              </div>

              <div className="rounded-xl border p-3.5 bg-slate-50/50">
                <span className="text-muted-foreground text-xs block">Income Cadence Regularity</span>
                <span className="text-lg font-bold text-foreground block mt-1">
                  {underwriting.salaryCadenceStatus}
                </span>
                <span className="text-[11px] text-muted-foreground">Payroll regularity & frequency</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 8. TAB 6: INTERACTIVE FACILITY STRUCTURING SIMULATOR */}
      {activeTab === "simulator" && (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border/80 shadow-xs">
            <CardHeader className="border-b border-border/70 bg-[#fbfcfb] pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                Credit Facility Structuring & Sensitivity Simulator
              </CardTitle>
              <CardDescription className="text-xs">
                Model debt limits, tenor, and interest rates to verify stress-tested debt service coverage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-5">
              {/* Proposed Loan Principal */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-foreground">Proposed Loan Principal Facility:</span>
                  <span className="font-mono text-base font-bold text-primary">
                    {formatMoney(simLoanAmount, currency)}
                  </span>
                </div>
                <div className="mt-2">
                  <Slider
                    value={[simLoanAmount]}
                    min={10000}
                    max={Math.max(100000, underwriting.recommendedLoanCeiling * 2)}
                    step={10000}
                    onValueChange={(val) => setSimLoanAmount(val[0])}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Min: {formatMoney(10000, currency)}</span>
                  <span>Rec: {formatMoney(underwriting.recommendedLoanCeiling, currency)}</span>
                  <span>Max: {formatMoney(Math.max(100000, underwriting.recommendedLoanCeiling * 2), currency)}</span>
                </div>
              </div>

              {/* Tenor */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-foreground">Repayment Tenor:</span>
                  <span className="font-mono text-base font-bold text-foreground">{simTenorMonths} Months</span>
                </div>
                <div className="mt-2 flex gap-2">
                  {[1, 3, 6, 12, 18, 24].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSimTenorMonths(m)}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                        simTenorMonths === m
                          ? "bg-primary text-white"
                          : "border border-border bg-white text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Interest Rate */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-foreground">Annual Interest Rate (APR):</span>
                  <span className="font-mono text-base font-bold text-foreground">{simInterestRateAnnual}% APR</span>
                </div>
                <div className="mt-2">
                  <Slider
                    value={[simInterestRateAnnual]}
                    min={8}
                    max={48}
                    step={1}
                    onValueChange={(val) => setSimInterestRateAnnual(val[0])}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>8% Prime</span>
                  <span>24% Standard</span>
                  <span>48% Unsecured Subprime</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Real-time Stress-Test Output Card */}
          <Card className="border-border/80 bg-[#183238] text-white shadow-xs">
            <CardHeader className="border-b border-white/10 pb-4">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                Modeled Repayment Capacity & Stress Impact
              </CardTitle>
              <CardDescription className="text-xs text-white/70">
                Calculates post-disbursement monthly impact against verified genuine disposable surplus.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="rounded-xl border border-white/15 bg-white/10 p-4">
                <span className="text-xs text-white/60">Simulated Monthly Installment (EMI)</span>
                <p className="text-3xl font-extrabold text-accent mt-1">
                  {formatMoney(simMonthlyInstallment, currency)}
                  <span className="text-xs font-normal text-white/70"> / month</span>
                </p>
                <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-xs">
                  <span className="text-white/70">Total Principal + Interest:</span>
                  <span className="font-mono font-semibold text-white">
                    {formatMoney(simMonthlyInstallment * simTenorMonths, currency)}
                  </span>
                </div>
              </div>

              {/* Stress-Test Indicators */}
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between rounded-lg bg-white/5 p-2.5">
                  <span className="text-white/70">Post-Disbursement DTI:</span>
                  <span
                    className={`font-bold font-mono ${
                      simPostLoanDti <= 35 ? "text-emerald-400" : simPostLoanDti <= 50 ? "text-amber-400" : "text-rose-400"
                    }`}
                  >
                    {simPostLoanDti}% {simPostLoanDti > 50 ? "(Excessive Risk)" : simPostLoanDti > 35 ? "(Moderate)" : "(Safe)"}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-white/5 p-2.5">
                  <span className="text-white/70">Post-Disbursement DSCR:</span>
                  <span
                    className={`font-bold font-mono ${
                      simPostLoanDscr >= 1.25 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {simPostLoanDscr.toFixed(2)}x {simPostLoanDscr >= 1.25 ? "(Compliant)" : "(Under-Covered)"}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-white/5 p-2.5">
                  <span className="text-white/70">Disposable Surplus Margin:</span>
                  <span className="font-bold text-white font-mono">
                    {formatMoney(Math.max(0, underwriting.genuineIncome.netDisposableIncome - simMonthlyInstallment), currency)}/mo remaining
                  </span>
                </div>
              </div>

              <Button
                id="apply-structure-memo-btn"
                onClick={onOpenCreditMemo}
                className="w-full bg-accent text-primary hover:bg-accent/90 text-xs font-semibold h-9 mt-2"
              >
                Insert This Facility Structure Into Credit Memo
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
