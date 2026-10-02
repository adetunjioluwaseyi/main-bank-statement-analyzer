export interface LedgerDiscrepancy {
  rowIndex: number;
  date: string;
  description: string;
  previousBalance: number;
  credit: number;
  debit: number;
  expectedBalance: number;
  statedBalance: number;
  difference: number;
}

export interface ReconciledTransactionAudit {
  rowIndex: number;
  date: string;
  description: string;
  credit: number;
  debit: number;
  previousBalance: number;
  expectedBalance: number;
  statedBalance: number;
  variance: number;
  isReconciled: boolean;
  status: "RECONCILED" | "DISCREPANCY" | "UNSPECIFIED_BALANCE";
}

export interface ReconciliationProof {
  openingBalance: number;
  totalCredits: number;
  totalDebits: number;
  expectedClosingBalance: number;
  actualClosingBalance: number;
  closingVariance: number;
  is100PercentReconciled: boolean;
  reconciliationRate: number; // 0 - 100%
  reconciledCount: number;
  breakCount: number;
  totalChecks: number;
}

export interface RoundTripSignal {
  inflowDate: string;
  inflowAmount: number;
  outflowDate: string;
  outflowAmount: number;
  drainedPercentage: number;
  description: string;
}

export interface CircularTransferSignal {
  inflowDate: string;
  inflowAmount: number;
  inflowDesc: string;
  outflowDate: string;
  outflowAmount: number;
  outflowDesc: string;
  turnaroundHops: number;
  drainPercentage: number;
  riskCategory: "Rapid Wash / Pass-Through" | "Circular Mule Flow" | "Artificial Turnover";
  riskSeverity: "High" | "Critical" | "Moderate";
}

export interface BalanceInflationSignal {
  depositDate: string;
  amount: number;
  daysBeforeStatementEnd: number;
  description: string;
  inflationImpact: string;
  note: string;
}

export interface StructuringSignal {
  date: string;
  amount: number;
  type: "credit" | "debit";
  description: string;
}

export interface StatementForensicsResult {
  mathIntegrityScore: number; // 0 - 100
  totalChecks: number;
  discrepancies: LedgerDiscrepancy[];
  hasMathTampering: boolean;
  reconciliationProof: ReconciliationProof;
  auditedRows: ReconciledTransactionAudit[];
  roundTrips: RoundTripSignal[];
  circularTransfers: CircularTransferSignal[];
  balanceInflation: BalanceInflationSignal[];
  structuringAlerts: StructuringSignal[];
  duplicateDebitsCount: number;
  forgeryRiskLevel: "Low" | "Moderate" | "Critical";
  forgeryRiskSummary: string;
}

export interface ForensicTransactionItem {
  index: number;
  date: string;
  description: string;
  credit: number;
  debit: number;
  balance: number;
}

export function runStatementForensics(
  transactions: ForensicTransactionItem[],
  openingBalance: number
): StatementForensicsResult {
  const discrepancies: LedgerDiscrepancy[] = [];
  const auditedRows: ReconciledTransactionAudit[] = [];
  let runningBalance = openingBalance;
  let totalChecks = 0;
  let totalCredits = 0;
  let totalDebits = 0;
  let lastStatedBalance = openingBalance;

  // 1. Line-by-Line 100% Math Reconciliation Check
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    totalCredits += tx.credit;
    totalDebits += tx.debit;

    if (tx.balance === 0 && tx.credit === 0 && tx.debit === 0) continue;

    const prevBal = runningBalance;
    const expected = prevBal + tx.credit - tx.debit;

    if (tx.balance !== 0) {
      totalChecks++;
      lastStatedBalance = tx.balance;
      const diff = Math.abs(expected - tx.balance);
      const isMatch = diff <= 0.05;

      if (!isMatch && prevBal !== 0) {
        discrepancies.push({
          rowIndex: i + 1,
          date: tx.date,
          description: tx.description,
          previousBalance: prevBal,
          credit: tx.credit,
          debit: tx.debit,
          expectedBalance: Math.round(expected * 100) / 100,
          statedBalance: tx.balance,
          difference: Math.round(diff * 100) / 100,
        });

        auditedRows.push({
          rowIndex: i + 1,
          date: tx.date,
          description: tx.description,
          credit: tx.credit,
          debit: tx.debit,
          previousBalance: prevBal,
          expectedBalance: Math.round(expected * 100) / 100,
          statedBalance: tx.balance,
          variance: Math.round(diff * 100) / 100,
          isReconciled: false,
          status: "DISCREPANCY",
        });
      } else {
        auditedRows.push({
          rowIndex: i + 1,
          date: tx.date,
          description: tx.description,
          credit: tx.credit,
          debit: tx.debit,
          previousBalance: prevBal,
          expectedBalance: Math.round(expected * 100) / 100,
          statedBalance: tx.balance,
          variance: 0,
          isReconciled: true,
          status: "RECONCILED",
        });
      }
      runningBalance = tx.balance;
    } else {
      // In cases where bank statement omitted stated balance on intermediary line
      runningBalance = expected;
      auditedRows.push({
        rowIndex: i + 1,
        date: tx.date,
        description: tx.description,
        credit: tx.credit,
        debit: tx.debit,
        previousBalance: prevBal,
        expectedBalance: Math.round(expected * 100) / 100,
        statedBalance: 0,
        variance: 0,
        isReconciled: true,
        status: "UNSPECIFIED_BALANCE",
      });
    }
  }

  // Grand Ledger Mathematical Proof Calculation:
  // Opening Balance + Sum(Credits) - Sum(Debits) == Closing Balance
  const expectedClosing = Math.round((openingBalance + totalCredits - totalDebits) * 100) / 100;
  const actualClosing = Math.round(lastStatedBalance * 100) / 100;
  const closingVariance = Math.round(Math.abs(expectedClosing - actualClosing) * 100) / 100;
  const isGrandProofValid = closingVariance <= 0.05 && discrepancies.length === 0;

  const mathIntegrityScore =
    totalChecks > 0
      ? Math.max(0, Math.round(((totalChecks - discrepancies.length) / totalChecks) * 100))
      : 100;

  const reconciliationProof: ReconciliationProof = {
    openingBalance: Math.round(openingBalance * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
    totalDebits: Math.round(totalDebits * 100) / 100,
    expectedClosingBalance: expectedClosing,
    actualClosingBalance: actualClosing,
    closingVariance,
    is100PercentReconciled: isGrandProofValid,
    reconciliationRate: mathIntegrityScore,
    reconciledCount: totalChecks - discrepancies.length,
    breakCount: discrepancies.length,
    totalChecks,
  };

  // 2. Wash-Trading & Circular-Transfer Detection Suite
  // Detects:
  // a) Rapid pass-through money mule flows (funds in -> drained >75% within 1-5 txs)
  // b) Circular loops where funds bounce in and out to artificial counterparties
  const roundTrips: RoundTripSignal[] = [];
  const circularTransfers: CircularTransferSignal[] = [];

  const largeCredits = transactions
    .filter((tx) => tx.credit > 0)
    .sort((a, b) => b.credit - a.credit);
  const creditMedian =
    largeCredits.length > 0 ? largeCredits[Math.floor(largeCredits.length / 2)].credit : 0;
  const washThreshold = Math.max(creditMedian * 1.3, 50000);

  for (let i = 0; i < transactions.length; i++) {
    const inflow = transactions[i];
    if (inflow.credit >= washThreshold) {
      let drained = 0;
      let primaryOutflow: ForensicTransactionItem | null = null;
      let hops = 0;

      // Look forward up to 6 transactions or within close timeframe
      for (let j = i + 1; j < Math.min(transactions.length, i + 7); j++) {
        hops++;
        const outflow = transactions[j];
        if (outflow.debit > 0) {
          drained += outflow.debit;
          if (!primaryOutflow || outflow.debit > primaryOutflow.debit) {
            primaryOutflow = outflow;
          }
          if (drained >= inflow.credit * 0.70) {
            break;
          }
        }
      }

      if (primaryOutflow && drained >= inflow.credit * 0.70) {
        const drainPct = Math.min(100, Math.round((drained / inflow.credit) * 100));

        roundTrips.push({
          inflowDate: inflow.date,
          inflowAmount: inflow.credit,
          outflowDate: primaryOutflow.date,
          outflowAmount: drained,
          drainedPercentage: drainPct,
          description: inflow.description,
        });

        const isImmediateHops = hops <= 2;
        const isCounterpartyBounce =
          /trf|transfer|p2p|wallet|pool|friends|personal/i.test(inflow.description) &&
          /trf|transfer|p2p|wallet|crypto|cash|outward/i.test(primaryOutflow.description);

        let riskCategory: CircularTransferSignal["riskCategory"] = "Rapid Wash / Pass-Through";
        let riskSeverity: CircularTransferSignal["riskSeverity"] = "Moderate";

        if (isImmediateHops && drainPct >= 85) {
          riskCategory = "Circular Mule Flow";
          riskSeverity = "Critical";
        } else if (isCounterpartyBounce || drainPct >= 90) {
          riskCategory = "Artificial Turnover";
          riskSeverity = "High";
        }

        circularTransfers.push({
          inflowDate: inflow.date,
          inflowAmount: inflow.credit,
          inflowDesc: inflow.description,
          outflowDate: primaryOutflow.date,
          outflowAmount: drained,
          outflowDesc: primaryOutflow.description,
          turnaroundHops: hops,
          drainPercentage: drainPct,
          riskCategory,
          riskSeverity,
        });
      }
    }
  }

  // 3. Balance Pump-and-Dump (Cut-Off Date Window Dressing)
  // Lenders must flag borrowers who artificially deposit money 1-4 days before statement end
  // to give the illusion of high closing liquidity.
  const balanceInflation: BalanceInflationSignal[] = [];
  if (transactions.length >= 8) {
    const last3Tx = transactions.slice(-3);
    const earlierTx = transactions.slice(0, -3);
    const avgEarlierCredit =
      earlierTx.filter((t) => t.credit > 0).reduce((sum, t) => sum + t.credit, 0) /
      Math.max(1, earlierTx.filter((t) => t.credit > 0).length);

    last3Tx.forEach((tx) => {
      if (tx.credit > 0 && tx.credit > avgEarlierCredit * 2.5 && tx.credit > 100000) {
        balanceInflation.push({
          depositDate: tx.date,
          amount: tx.credit,
          daysBeforeStatementEnd: 3,
          description: tx.description,
          inflationImpact: `Inflated closing balance by ${(tx.credit / Math.max(1, lastStatedBalance) * 100).toFixed(0)}%`,
          note: "Uncharacteristic large deposit injected right before statement close. Verify borrower is not temporarily borrowing funds to window-dress liquidity.",
        });
      }
    });
  }

  // 4. Structuring / Smurfing Alert
  // Repeated transactions clustered just under regulatory AML limits (e.g. 5M NGN, 1M NGN, 10k USD)
  const structuringAlerts: StructuringSignal[] = [];
  transactions.forEach((tx) => {
    const val = tx.credit > 0 ? tx.credit : tx.debit;
    const type = tx.credit > 0 ? "credit" : "debit";
    if (
      (val >= 4500000 && val < 5000000) ||
      (val >= 900000 && val < 1000000) ||
      (val >= 9000 && val < 10000)
    ) {
      structuringAlerts.push({
        date: tx.date,
        amount: val,
        type,
        description: tx.description,
      });
    }
  });

  // 5. Duplicate Debits Frequency
  const debitFreq = new Map<string, number>();
  transactions.forEach((tx) => {
    if (tx.debit > 0) {
      const key = `${tx.description.toLowerCase().trim()}|${tx.debit}`;
      debitFreq.set(key, (debitFreq.get(key) || 0) + 1);
    }
  });
  let duplicateDebitsCount = 0;
  debitFreq.forEach((count) => {
    if (count > 1) duplicateDebitsCount += count - 1;
  });

  // 6. Overall Forgery & Tamper Risk Level
  let forgeryRiskLevel: "Low" | "Moderate" | "Critical" = "Low";
  let forgeryRiskSummary =
    "100% mathematical ledger continuity confirmed. All rows reconcile with zero mathematical leakage.";

  if (discrepancies.length >= 3 || mathIntegrityScore < 80 || circularTransfers.some((c) => c.riskSeverity === "Critical")) {
    forgeryRiskLevel = "Critical";
    forgeryRiskSummary = `Critical audit failure: ${discrepancies.length} mathematical ledger breaks detected (${mathIntegrityScore}% pass rate) and ${circularTransfers.length} circular wash cycles. Strong indicators of statement manipulation or pass-through mule activity.`;
  } else if (discrepancies.length > 0 || circularTransfers.length >= 2 || balanceInflation.length > 0) {
    forgeryRiskLevel = "Moderate";
    forgeryRiskSummary = `Noticeable ledger deviations or circular velocity detected (${discrepancies.length} math breaks, ${circularTransfers.length} wash cycles, ${balanceInflation.length} end-of-period pump alert). Underwriter manual verification required.`;
  }

  return {
    mathIntegrityScore,
    totalChecks,
    discrepancies,
    hasMathTampering: discrepancies.length > 0,
    reconciliationProof,
    auditedRows,
    roundTrips,
    circularTransfers,
    balanceInflation,
    structuringAlerts,
    duplicateDebitsCount,
    forgeryRiskLevel,
    forgeryRiskSummary,
  };
}
