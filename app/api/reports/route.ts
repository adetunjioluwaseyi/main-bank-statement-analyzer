import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool, withMysqlTransaction } from "@/lib/mysql";
import { getAuthenticatedUser, getRequestIp } from "@/lib/server-session";
import type { StatementReportInput } from "@/lib/statement-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function validateReportInput(value: unknown): StatementReportInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<StatementReportInput>;
  if (
    typeof input.fileName !== "string" ||
    !input.fileName.trim() ||
    input.fileName.length > 255 ||
    (input.status !== "success" && input.status !== "failed") ||
    !isOptionalNumber(input.fileSize) ||
    !isOptionalNumber(input.transactionCount) ||
    !isOptionalNumber(input.openingBalance) ||
    !isOptionalNumber(input.closingBalance) ||
    !isOptionalNumber(input.totalInflow) ||
    !isOptionalNumber(input.totalOutflow) ||
    !isOptionalNumber(input.netCashFlow) ||
    !isOptionalNumber(input.integrityScore) ||
    (input.fileSize !== undefined &&
      (!Number.isSafeInteger(input.fileSize) || input.fileSize < 0 || input.fileSize > 30 * 1024 * 1024)) ||
    (input.transactionCount !== undefined &&
      (!Number.isSafeInteger(input.transactionCount) ||
        input.transactionCount < 0 ||
        input.transactionCount > 2_147_483_647)) ||
    [input.openingBalance, input.closingBalance, input.totalInflow, input.totalOutflow, input.netCashFlow]
      .some((amount) => amount !== undefined && Math.abs(amount) > 1e18) ||
    (input.integrityScore !== undefined &&
      (input.integrityScore < 0 || input.integrityScore > 100)) ||
    (input.fileSha256 !== undefined && !/^[a-f\d]{64}$/i.test(input.fileSha256)) ||
    (input.periodStart !== undefined &&
      (typeof input.periodStart !== "string" || input.periodStart.length > 40)) ||
    (input.periodEnd !== undefined &&
      (typeof input.periodEnd !== "string" || input.periodEnd.length > 40)) ||
    (input.integrityStatus !== undefined &&
      (typeof input.integrityStatus !== "string" || input.integrityStatus.length > 40)) ||
    (input.failureMessage !== undefined &&
      (typeof input.failureMessage !== "string" || input.failureMessage.length > 500)) ||
    (input.reconciliationWarnings !== undefined &&
      (!Array.isArray(input.reconciliationWarnings) ||
        input.reconciliationWarnings.length > 100 ||
        !input.reconciliationWarnings.every(
          (warning) => typeof warning === "string" && warning.length <= 300
        )))
  ) {
    return null;
  }

  return {
    fileName: input.fileName.trim(),
    status: input.status,
    fileSize: input.fileSize,
    fileSha256: input.fileSha256,
    transactionCount: input.transactionCount,
    openingBalance: input.openingBalance,
    closingBalance: input.closingBalance,
    totalInflow: input.totalInflow,
    totalOutflow: input.totalOutflow,
    netCashFlow: input.netCashFlow,
    integrityStatus: input.integrityStatus,
    integrityScore: input.integrityScore,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    reconciliationWarnings: input.reconciliationWarnings,
    failureMessage: input.failureMessage?.slice(0, 500),
  };
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ message: "Sign in is required." }, { status: 401 });

    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, file_name, analyzed_at, transaction_count, status,
              opening_balance, closing_balance, total_inflow, total_outflow,
              integrity_status, failure_message
       FROM analyzed_statement_reports
       WHERE user_id = ?
       ORDER BY analyzed_at DESC
       LIMIT 100`,
      [user.id]
    );
    const [countRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(status = 'success'), 0) AS successful,
              COALESCE(SUM(status = 'failed'), 0) AS failed
       FROM analyzed_statement_reports WHERE user_id = ?`,
      [user.id]
    );
    const [activityRows] = await pool.execute<RowDataPacket[]>(
      `SELECT DATE_FORMAT(analyzed_at, '%Y-%m-%d') AS report_day,
              COALESCE(SUM(status = 'success'), 0) AS successful,
              COALESCE(SUM(status = 'failed'), 0) AS failed
       FROM analyzed_statement_reports
       WHERE user_id = ?
         AND analyzed_at >= UTC_DATE() - INTERVAL 6 DAY
       GROUP BY DATE(analyzed_at)
       ORDER BY report_day`,
      [user.id]
    );

    const records = rows.map((row) => ({
      id: String(row.id),
      fileName: String(row.file_name),
      analyzedAt:
        row.analyzed_at instanceof Date
          ? row.analyzed_at.toISOString()
          : new Date(row.analyzed_at).toISOString(),
      transactionCount: Number(row.transaction_count),
      status: row.status as "success" | "failed",
      openingBalance: row.opening_balance === null ? null : Number(row.opening_balance),
      closingBalance: row.closing_balance === null ? null : Number(row.closing_balance),
      totalInflow: row.total_inflow === null ? null : Number(row.total_inflow),
      totalOutflow: row.total_outflow === null ? null : Number(row.total_outflow),
      integrityStatus: row.integrity_status ? String(row.integrity_status) : null,
      failureMessage: row.failure_message ? String(row.failure_message) : null,
    }));
    const counts = countRows[0] || {};
    const activity = activityRows.map((row) => ({
      date: String(row.report_day),
      successful: Number(row.successful),
      failed: Number(row.failed),
    }));
    return NextResponse.json({
      records,
      summary: {
        total: Number(counts.total || 0),
        successful: Number(counts.successful || 0),
        failed: Number(counts.failed || 0),
        activity,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[Reports] Could not load statement history:", error);
    return NextResponse.json({ message: "Statement history could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ message: "Sign in is required." }, { status: 401 });

    const input = validateReportInput(await request.json());
    if (!input) {
      return NextResponse.json({ message: "The report summary is invalid." }, { status: 400 });
    }

    const transactionCount =
      input.status === "success" ? Math.max(0, Math.floor(input.transactionCount || 0)) : 0;
    const summary = {
      periodStart: input.periodStart?.slice(0, 40),
      periodEnd: input.periodEnd?.slice(0, 40),
      integrityScore: input.integrityScore,
      reconciliationWarnings: input.reconciliationWarnings,
    };

    const reportId = await withMysqlTransaction(async (connection) => {
      const [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO analyzed_statement_reports
          (user_id, file_name, file_size, file_sha256, status, transaction_count,
           opening_balance, closing_balance, total_inflow, total_outflow, net_cash_flow,
           integrity_status, integrity_score, analysis_summary, failure_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          input.fileName,
          input.fileSize ?? null,
          input.fileSha256 ?? null,
          input.status,
          transactionCount,
          input.status === "success" ? input.openingBalance ?? null : null,
          input.status === "success" ? input.closingBalance ?? null : null,
          input.status === "success" ? input.totalInflow ?? null : null,
          input.status === "success" ? input.totalOutflow ?? null : null,
          input.status === "success" ? input.netCashFlow ?? null : null,
          input.integrityStatus ?? null,
          input.integrityScore ?? null,
          JSON.stringify(summary),
          input.status === "failed" ? input.failureMessage ?? null : null,
        ]
      );
      const id = String(insertResult.insertId);
      await connection.execute<ResultSetHeader>(
        `INSERT INTO audit (user_id, action, entity_type, entity_id, details, ip_address)
         VALUES (?, ?, 'statement_report', ?, ?, ?)`,
        [
          user.id,
          `statement_analysis.${input.status}`,
          id,
          JSON.stringify({ fileName: input.fileName, transactionCount }),
          getRequestIp(request),
        ]
      );
      return id;
    });

    return NextResponse.json({ id: reportId }, { status: 201 });
  } catch (error) {
    console.error("[Reports] Could not save statement report:", error);
    return NextResponse.json({ message: "The statement report could not be saved." }, { status: 500 });
  }
}
