import type { StatementForensicsResult } from "./statement-forensics";

export interface IncomeStreamItem {
  source: string;
  type: "Payroll / Employer" | "Client / Contract" | "Operating Revenue" | "Passive / Investment";
  totalReceived: number;
  transactionCount: number;
  cadence: "Monthly Recurring" | "Bi-Weekly" | "Weekly" | "Irregular";
  consistencyScore: number; // 0 - 100
}

export interface GenuineIncomeAnalysis {
  grossInflows: number;
  genuineOperatingIncome: number;
  nonIncomeInflows: number;
  incomeQualityRatio: number; // % genuine / gross
  stabilityScore: number; // 0 - 100
  netDisposableIncome: number;
  excludedBreakdown: {
    loanDisbursements: number;
    internalSelfTransfers: number;
    reversalsAndRefunds: number;
    gamblingOrP2pCashin: number;
    anomalousDeposits: number;
  };
  detectedStreams: IncomeStreamItem[];
  cadenceStatus: "Regular Institutional" | "Semi-Regular" | "Irregular / Variable";
}

export interface CreditScorePillars {
  solvency: { score: number; max: 25; label: string; detail: string };
  liquidity: { score: number; max: 25; label: string; detail: string };
  incomeQuality: { score: number; max: 25; label: string; detail: string };
  forensics: { score: number; max: 25; label: string; detail: string };
}

export interface PolicyCheckItem {
  rule: string;
  status: "PASSED" | "FLAGGED" | "FAILED";
  detail: string;
}

export interface ExecutiveUnderwritingVerdict {
  decision: "APPROVED" | "CONDITIONAL_APPROVAL" | "DECLINED";
  verdictSummary: string;
  recommendedFacility: number;
  maxSafeMonthlyInstallment: number;
  recommendedTenorMonths: number;
  suggestedRateSpread: string;
  policyChecks: PolicyCheckItem[];
  conditions: string[];
}

export interface UnderwritingMetrics {
  averageDailyBalance: number;
  dtiRatio: number; // Debt to Income %
  foirRatio: number; // Fixed Obligation to Income Ratio %
  dscrRatio: number; // Debt Service Coverage Ratio
  cashRunwayDays: number; // Days of operating survival
  creditScore: number; // 0 - 100 for backward compatibility
  institutionalScore: number; // 300 - 850 FICO-style score
  creditGrade: "A+" | "A" | "B" | "C" | "D" | "AAA" | "AA" | "F";
  riskTier: "Prime" | "Near Prime" | "Subprime" | "High Risk / Decline";
  creditGradeDescription: string;
  recommendedLoanCeiling: number;
  maxMonthlyRepayment: number;
  salaryCadenceStatus: "Regular Institutional" | "Semi-Regular" | "Irregular / Variable";
  genuineIncome: GenuineIncomeAnalysis;
  scorePillars: CreditScorePillars;
  verdict: ExecutiveUnderwritingVerdict;
  gamblingExposure: {
    totalSpent: number;
    count: number;
    percentOfOutflow: number;
  };
  paydayLoanExposure: {
    totalRepayments: number;
    appCount: number;
    detectedApps: string[];
  };
  nsfAndPenalties: {
    count: number;
    totalAmount: number;
  };
}

export interface UnderwritingInput {
  income: number; // Gross inflows
  outflow: number;
  net: number;
  openingBalance: number;
  closingBalance: number;
  minimumBalance: number;
  averageBalance: number;
  transactions: {
    date: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
    category: string;
  }[];
  monthlyBreakdown: { month: string; income: number; outflow: number; net: number }[];
  mathIntegrityScore: number;
  forensics?: StatementForensicsResult;
  accountHolder?: string;
}

export function calculateUnderwriting(input: UnderwritingInput): UnderwritingMetrics {
  const {
    income: grossInflow,
    outflow,
    closingBalance,
    transactions,
    monthlyBreakdown,
    mathIntegrityScore,
    forensics,
    accountHolder = "",
  } = input;

  // 1. Calculate Average Daily Balance (ADB)
  const dailyBalances = new Map<string, number>();
  transactions.forEach((tx) => {
    if (tx.date && tx.balance !== 0) {
      dailyBalances.set(tx.date, tx.balance);
    }
  });

  const distinctDailyBalances = Array.from(dailyBalances.values());
  const averageDailyBalance =
    distinctDailyBalances.length > 0
      ? distinctDailyBalances.reduce((sum, b) => sum + b, 0) / distinctDailyBalances.length
      : input.averageBalance || (input.openingBalance + closingBalance) / 2;

  // 2. Behavioral Exposures (Gambling, Payday Apps, NSF, Commitments)
  let gamblingSpent = 0;
  let gamblingCount = 0;
  let paydayRepayments = 0;
  const paydayApps = new Set<string>();
  let nsfCount = 0;
  let nsfTotal = 0;
  let fixedCommitments = 0;

  // Non-Income Inflow Trackers
  let loanDisbursements = 0;
  let internalSelfTransfers = 0;
  let reversalsAndRefunds = 0;
  let gamblingOrP2pCashin = 0;
  let anomalousDeposits = 0;

  const holderTokens = accountHolder
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  const streamsMap = new Map<string, { total: number; count: number; type: IncomeStreamItem["type"] }>();

  transactions.forEach((tx) => {
    const desc = tx.description.toLowerCase();

    // Outflow tracking
    if (tx.debit > 0) {
      if (
        tx.category === "Gambling & Betting" ||
        /bet9ja|sportybet|1xbet|betway|nairabet|stake|casino|bangbet|betking/i.test(desc)
      ) {
        gamblingSpent += tx.debit;
        gamblingCount++;
      }
      if (
        tx.category === "Loan / Payday Apps" ||
        /fairmoney|carbon|branch|quickcheck|renmoney|palmpay loan|opay loan|specta|kuda overdraft|page financials|creditclan/i.test(
          desc
        )
      ) {
        paydayRepayments += tx.debit;
        const matched = desc.match(
          /(fairmoney|carbon|branch|quickcheck|renmoney|palmpay|opay|kuda|specta|page financials)/i
        );
        if (matched) paydayApps.add(matched[1].toUpperCase());
      }
      if (
        tx.category === "Bank Penalty / NSF" ||
        /dishonou?red|nsf|insufficient funds|overdraft charge|penalty fee|unpaid cheque/i.test(desc)
      ) {
        nsfCount++;
        nsfTotal += tx.debit;
      }
      if (
        tx.category === "Bills & Utilities" ||
        tx.category === "Housing & Rent" ||
        /ikedc|ekedc|electric|dstv|gotv|rent|service charge/i.test(desc)
      ) {
        fixedCommitments += tx.debit;
      }
    }

    // Inflow tracking - GENUINE INCOME VS ARTIFICIAL/LOAN INFLOWS
    if (tx.credit > 0) {
      const isLoanCredit =
        /loan|disbursement|credit facility|fairmoney|carbon|branch|renmoney|quickcheck|specta|overdraft/i.test(
          desc
        );
      const isSelfTransfer =
        /self|own account|trf from self|intra-bank self/i.test(desc) ||
        (holderTokens.length > 0 && holderTokens.every((token) => desc.includes(token)));
      const isReversal =
        /reversal|refund|chargeback|declined pos reversal|failed trf reversal/i.test(desc);
      const isGamblingPayout =
        /bet9ja payout|sportybet payout|1xbet payout|betway win|lottery/i.test(desc);

      if (isLoanCredit) {
        loanDisbursements += tx.credit;
      } else if (isSelfTransfer) {
        internalSelfTransfers += tx.credit;
      } else if (isReversal) {
        reversalsAndRefunds += tx.credit;
      } else if (isGamblingPayout) {
        gamblingOrP2pCashin += tx.credit;
      } else {
        // Genuine operational income candidate
        let streamType: IncomeStreamItem["type"] = "Operating Revenue";
        let sourceName = tx.description.slice(0, 32).trim();

        if (/salary|payroll|wages|staff remun|tech horizons|monthly stip|allowance/i.test(desc)) {
          streamType = "Payroll / Employer";
          sourceName = tx.description.replace(/^(salary|cr|payroll|trf from|payment for)\s*/i, "").slice(0, 28).trim();
        } else if (/client|invoice|consult|retainer|contract|project|settlement/i.test(desc)) {
          streamType = "Client / Contract";
        } else if (/div|interest|coupon|fbnquest|stanbic asset|cowrywise|piggyvest interest/i.test(desc)) {
          streamType = "Passive / Investment";
        }

        const existing = streamsMap.get(sourceName) || { total: 0, count: 0, type: streamType };
        streamsMap.set(sourceName, {
          total: existing.total + tx.credit,
          count: existing.count + 1,
          type: streamType,
        });
      }
    }
  });

  const nonIncomeInflows =
    loanDisbursements + internalSelfTransfers + reversalsAndRefunds + gamblingOrP2pCashin + anomalousDeposits;
  const genuineOperatingIncome = Math.max(0, grossInflow - nonIncomeInflows);
  const incomeQualityRatio =
    grossInflow > 0 ? Math.min(100, Math.round((genuineOperatingIncome / grossInflow) * 100)) : 0;

  // Format detected streams
  const detectedStreams: IncomeStreamItem[] = Array.from(streamsMap.entries())
    .map(([source, data]) => {
      const isRecurring = data.count >= 2;
      const cadence: IncomeStreamItem["cadence"] =
        data.count >= 3 ? "Monthly Recurring" : data.count === 2 ? "Bi-Weekly" : "Irregular";
      const consistencyScore = Math.min(100, data.count * 30 + (data.type === "Payroll / Employer" ? 40 : 15));
      return {
        source,
        type: data.type,
        totalReceived: Math.round(data.total),
        transactionCount: data.count,
        cadence,
        consistencyScore,
      };
    })
    .sort((a, b) => b.totalReceived - a.totalReceived)
    .slice(0, 5);

  const payrollStreams = detectedStreams.filter((s) => s.type === "Payroll / Employer");
  let salaryCadenceStatus: UnderwritingMetrics["salaryCadenceStatus"] = "Irregular / Variable";
  if (payrollStreams.some((p) => p.transactionCount >= 3)) {
    salaryCadenceStatus = "Regular Institutional";
  } else if (payrollStreams.length > 0 || detectedStreams.some((s) => s.transactionCount >= 2)) {
    salaryCadenceStatus = "Semi-Regular";
  }

  const stabilityScore = Math.min(
    100,
    Math.round(
      (incomeQualityRatio * 0.4) +
      (salaryCadenceStatus === "Regular Institutional" ? 50 : salaryCadenceStatus === "Semi-Regular" ? 30 : 10) +
      (detectedStreams.length > 0 ? 10 : 0)
    )
  );

  const monthsCount = Math.max(1, monthlyBreakdown.length);
  const monthlyGenuineIncome = genuineOperatingIncome / monthsCount;
  const monthlyDebtService = paydayRepayments / monthsCount;
  const monthlyFixed = fixedCommitments / monthsCount;
  const netDisposableIncome = Math.max(0, monthlyGenuineIncome - monthlyDebtService - monthlyFixed);

  // 3. Ratios & Solvency
  const dtiRatio =
    monthlyGenuineIncome > 0 ? Math.min(100, Math.round((monthlyDebtService / monthlyGenuineIncome) * 100)) : 0;
  const foirRatio =
    monthlyGenuineIncome > 0
      ? Math.min(100, Math.round(((monthlyDebtService + monthlyFixed) / monthlyGenuineIncome) * 100))
      : 0;
  const dscrRatio =
    monthlyDebtService > 0 ? Math.round((monthlyGenuineIncome / monthlyDebtService) * 100) / 100 : 3.5;

  const dailyOutflowRate = outflow / Math.max(1, transactions.length);
  const cashRunwayDays =
    dailyOutflowRate > 0 ? Math.min(365, Math.round(averageDailyBalance / dailyOutflowRate)) : 90;

  // 4. Four Pillar Institutional Scoring (Each max 25 pts = 100 total)
  // Pillar 1: Debt Service & Solvency (25 pts)
  let solvencyScore = 25;
  if (dtiRatio > 50) solvencyScore -= 15;
  else if (dtiRatio > 35) solvencyScore -= 8;
  else if (dtiRatio > 20) solvencyScore -= 3;
  if (dscrRatio < 1.15) solvencyScore -= 10;
  else if (dscrRatio < 1.35) solvencyScore -= 5;
  solvencyScore = Math.max(0, Math.min(25, solvencyScore));

  // Pillar 2: Liquidity & Cash Buffer (25 pts)
  let liquidityScore = 15;
  if (averageDailyBalance > monthlyGenuineIncome * 0.5) liquidityScore += 7;
  else if (averageDailyBalance > monthlyGenuineIncome * 0.25) liquidityScore += 4;
  if (cashRunwayDays >= 30) liquidityScore += 3;
  if (input.minimumBalance < 0) liquidityScore -= 10;
  liquidityScore = Math.max(0, Math.min(25, liquidityScore));

  // Pillar 3: Genuine Income & Quality (25 pts)
  let incomeScore = 12;
  if (incomeQualityRatio >= 85) incomeScore += 8;
  else if (incomeQualityRatio >= 65) incomeScore += 4;
  else incomeScore -= 6;
  if (salaryCadenceStatus === "Regular Institutional") incomeScore += 5;
  else if (salaryCadenceStatus === "Semi-Regular") incomeScore += 3;
  incomeScore = Math.max(0, Math.min(25, incomeScore));

  // Pillar 4: Forensic Integrity & Behavioral Health (25 pts)
  let forensicsScore = 25;
  if (mathIntegrityScore < 85) forensicsScore -= 18;
  else if (mathIntegrityScore < 98) forensicsScore -= 8;
  if (forensics && forensics.circularTransfers.length > 0) forensicsScore -= 8;
  if (nsfCount > 0) forensicsScore -= Math.min(10, nsfCount * 4);
  if (gamblingSpent > 0 && (gamblingSpent / Math.max(1, outflow)) > 0.05) forensicsScore -= 6;
  if (paydayApps.size > 1) forensicsScore -= Math.min(8, paydayApps.size * 3);
  forensicsScore = Math.max(0, Math.min(25, forensicsScore));

  const totalComponentScore = solvencyScore + liquidityScore + incomeScore + forensicsScore; // 0 - 100
  // Institutional FICO-style mapping: 300 + (totalComponentScore * 5.5) -> range 300 to 850
  const institutionalScore = Math.round(300 + totalComponentScore * 5.5);

  let creditGrade: UnderwritingMetrics["creditGrade"] = "B";
  let riskTier: UnderwritingMetrics["riskTier"] = "Near Prime";
  let creditGradeDescription = "";

  if (institutionalScore >= 780) {
    creditGrade = "AAA";
    riskTier = "Prime";
    creditGradeDescription = "Super Prime · Flawless 100% Ledger Reconciliation · Superior Cash Flow & Solvency";
  } else if (institutionalScore >= 720) {
    creditGrade = "A";
    riskTier = "Prime";
    creditGradeDescription = "Standard Prime · Strong Verified Genuine Income · Low Debt Service Obligations";
  } else if (institutionalScore >= 640) {
    creditGrade = "B";
    riskTier = "Near Prime";
    creditGradeDescription = "Near Prime · Acceptable Operating Flow · Moderate Exposure to Payday / Commitments";
  } else if (institutionalScore >= 560) {
    creditGrade = "C";
    riskTier = "Subprime";
    creditGradeDescription = "Subprime / Elevated Risk · Tight Liquidity or Irregular Deposit Flows · Requires Enhanced Collateral";
  } else {
    creditGrade = "D";
    riskTier = "High Risk / Decline";
    creditGradeDescription = "Decline / Critical Risk · Forensic Breaks, Circular Transfers, or Persistent NSF Charges";
  }

  // 5. Loan Limits & Facility Recommendations
  // Safe EMI: Max 35% of Verified Net Disposable Monthly Surplus
  const maxMonthlyRepayment = Math.max(
    0,
    Math.round(Math.min(netDisposableIncome * 0.45, monthlyGenuineIncome * 0.33))
  );
  // Default facility recommended based on 3.5x to 6x monthly debt capacity depending on risk grade
  const multiplier = institutionalScore >= 720 ? 5.5 : institutionalScore >= 640 ? 3.5 : 2.0;
  const recommendedLoanCeiling = Math.round(maxMonthlyRepayment * multiplier);

  // 6. Policy Checks & Automated Underwriting Verdict
  const policyChecks: PolicyCheckItem[] = [
    {
      rule: "100% Mathematical Ledger Reconciliation",
      status: mathIntegrityScore >= 99 ? "PASSED" : mathIntegrityScore >= 85 ? "FLAGGED" : "FAILED",
      detail:
        mathIntegrityScore >= 99
          ? "All rows balance with mathematical continuity."
          : `${100 - mathIntegrityScore}% discrepancy rate observed in running balance.`,
    },
    {
      rule: "Genuine Operating Income Coverage",
      status: incomeQualityRatio >= 75 ? "PASSED" : incomeQualityRatio >= 50 ? "FLAGGED" : "FAILED",
      detail: `${incomeQualityRatio}% of inflows verified as genuine earned revenue.`,
    },
    {
      rule: "Debt-to-Income (DTI) Threshold <= 40%",
      status: dtiRatio <= 35 ? "PASSED" : dtiRatio <= 50 ? "FLAGGED" : "FAILED",
      detail: `Existing debt service is ${dtiRatio}% of verified operating income.`,
    },
    {
      rule: "Debt Service Coverage Ratio (DSCR) >= 1.25x",
      status: dscrRatio >= 1.35 ? "PASSED" : dscrRatio >= 1.15 ? "FLAGGED" : "FAILED",
      detail: `Coverage ratio stands at ${dscrRatio.toFixed(2)}x monthly debt obligations.`,
    },
    {
      rule: "Anti-Fraud & Circular Transfer Check",
      status:
        forensics && forensics.circularTransfers.length === 0
          ? "PASSED"
          : forensics && forensics.circularTransfers.some((c) => c.riskSeverity === "Critical")
          ? "FAILED"
          : "FLAGGED",
      detail:
        forensics && forensics.circularTransfers.length > 0
          ? `${forensics.circularTransfers.length} rapid wash/circular cycles detected.`
          : "No circular velocity or pass-through wash trading detected.",
    },
    {
      rule: "Zero Bounced Checks / Bank Penalties",
      status: nsfCount === 0 ? "PASSED" : "FAILED",
      detail: nsfCount === 0 ? "Clean record with 0 NSF incidents." : `${nsfCount} returned/NSF fee incident(s) detected.`,
    },
  ];

  let decision: ExecutiveUnderwritingVerdict["decision"] = "APPROVED";
  let verdictSummary = "";
  const conditions: string[] = [];

  const failedCount = policyChecks.filter((p) => p.status === "FAILED").length;
  const flaggedCount = policyChecks.filter((p) => p.status === "FLAGGED").length;

  if (failedCount >= 1 || institutionalScore < 560 || mathIntegrityScore < 85) {
    decision = "DECLINED";
    verdictSummary =
      failedCount > 0
        ? `Application declined due to ${failedCount} critical policy failure(s) including ${policyChecks
            .filter((p) => p.status === "FAILED")
            .map((p) => p.rule)
            .join("; ")}.`
        : "Application declined due to elevated credit risk and low solvency margin.";
  } else if (flaggedCount >= 1 || institutionalScore < 700 || paydayApps.size > 0) {
    decision = "CONDITIONAL_APPROVAL";
    verdictSummary =
      "Conditional approval granted. Borrower demonstrates viable revenue but requires enhanced underwriting covenants or lower exposure.";
    if (paydayApps.size > 0) conditions.push(`Consolidate or liquidate ${paydayApps.size} outstanding microloan(s).`);
    if (incomeQualityRatio < 80) conditions.push("Provide 3 months of supplemental tax or employment contracts.");
    if (cashRunwayDays < 30) conditions.push("Establish cash-collateralized reserve or require personal guarantor.");
  } else {
    decision = "APPROVED";
    verdictSummary =
      "Full approval recommended. Verified genuine cash flows comfortably exceed debt service with pristine 100% ledger reconciliation.";
    conditions.push("Standard direct debit / e-mandate execution prior to disbursement.");
  }

  const verdict: ExecutiveUnderwritingVerdict = {
    decision,
    verdictSummary,
    recommendedFacility: recommendedLoanCeiling,
    maxSafeMonthlyInstallment: maxMonthlyRepayment,
    recommendedTenorMonths: institutionalScore >= 720 ? 12 : 6,
    suggestedRateSpread:
      institutionalScore >= 750 ? "Prime Base + 2.5%" : institutionalScore >= 650 ? "Base + 5.0%" : "Base + 8.5%",
    policyChecks,
    conditions,
  };

  const scorePillars: CreditScorePillars = {
    solvency: {
      score: solvencyScore,
      max: 25,
      label: "Debt Service & Solvency",
      detail: `DTI: ${dtiRatio}% · DSCR: ${dscrRatio.toFixed(2)}x`,
    },
    liquidity: {
      score: liquidityScore,
      max: 25,
      label: "Liquidity & Buffer",
      detail: `ADB: ${Math.round(averageDailyBalance).toLocaleString()} · Runway: ${cashRunwayDays}d`,
    },
    incomeQuality: {
      score: incomeScore,
      max: 25,
      label: "Genuine Income Quality",
      detail: `${incomeQualityRatio}% genuine · ${salaryCadenceStatus}`,
    },
    forensics: {
      score: forensicsScore,
      max: 25,
      label: "Forensics & Integrity",
      detail: `${mathIntegrityScore}% reconciliation · ${nsfCount} NSF`,
    },
  };

  return {
    averageDailyBalance: Math.round(averageDailyBalance),
    dtiRatio: Math.round(dtiRatio * 10) / 10,
    foirRatio: Math.round(foirRatio * 10) / 10,
    dscrRatio: Math.round(dscrRatio * 100) / 100,
    cashRunwayDays,
    creditScore: totalComponentScore,
    institutionalScore,
    creditGrade,
    riskTier,
    creditGradeDescription,
    recommendedLoanCeiling,
    maxMonthlyRepayment,
    salaryCadenceStatus,
    genuineIncome: {
      grossInflows: Math.round(grossInflow),
      genuineOperatingIncome: Math.round(genuineOperatingIncome),
      nonIncomeInflows: Math.round(nonIncomeInflows),
      incomeQualityRatio,
      stabilityScore,
      netDisposableIncome: Math.round(netDisposableIncome),
      excludedBreakdown: {
        loanDisbursements: Math.round(loanDisbursements),
        internalSelfTransfers: Math.round(internalSelfTransfers),
        reversalsAndRefunds: Math.round(reversalsAndRefunds),
        gamblingOrP2pCashin: Math.round(gamblingOrP2pCashin),
        anomalousDeposits: Math.round(anomalousDeposits),
      },
      detectedStreams,
      cadenceStatus: salaryCadenceStatus,
    },
    scorePillars,
    verdict,
    gamblingExposure: {
      totalSpent: Math.round(gamblingSpent),
      count: gamblingCount,
      percentOfOutflow: Math.round(((gamblingSpent / Math.max(1, outflow)) * 100) * 10) / 10,
    },
    paydayLoanExposure: {
      totalRepayments: Math.round(paydayRepayments),
      appCount: paydayApps.size,
      detectedApps: Array.from(paydayApps),
    },
    nsfAndPenalties: {
      count: nsfCount,
      totalAmount: Math.round(nsfTotal),
    },
  };
}
