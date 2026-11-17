export interface StatementReportRecord {
  id: string;
  fileName: string;
  analyzedAt: string;
  transactionCount: number;
  status: "success" | "failed";
  openingBalance: number | null;
  closingBalance: number | null;
  totalInflow: number | null;
  totalOutflow: number | null;
  integrityStatus: string | null;
  failureMessage: string | null;
}

export interface StatementDashboardSummary {
  total: number;
  successful: number;
  failed: number;
  activity: Array<{
    date: string;
    successful: number;
    failed: number;
  }>;
}

export interface WorkspaceUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: "user" | "admin";
  status: "active" | "suspended";
}

export interface StatementReportInput {
  fileName: string;
  fileSize?: number;
  fileSha256?: string;
  status: "success" | "failed";
  transactionCount?: number;
  openingBalance?: number;
  closingBalance?: number;
  totalInflow?: number;
  totalOutflow?: number;
  netCashFlow?: number;
  integrityStatus?: string;
  integrityScore?: number;
  periodStart?: string;
  periodEnd?: string;
  reconciliationWarnings?: string[];
  failureMessage?: string;
}

// Added: client bundle schema to support multi-statement analysis for the same applicant/customer.
export interface ClientStatementBundleStatement {
  id: string;
  fileName: string;
  accountNumber?: string;
  accountHolder?: string;
  bankName?: string;
  openingBalance?: number;
  closingBalance?: number;
  totalInflow?: number;
  totalOutflow?: number;
  analyzedAt?: string;
}

export interface ClientStatementBundleSummary {
  bundleId: string;
  clientId?: string;
  statementCount: number;
  totalCredits: number;
  totalDebits: number;
  netCashFlow: number;
  startDate?: string;
  endDate?: string;
  highRiskStatements: number;
  expenseFlowByBank: Record<string, number>;
}

export interface ClientStatementBundleReport {
  bundleId: string;
  clientId?: string;
  summary: ClientStatementBundleSummary;
  statements: ClientStatementBundleStatement[];
}
