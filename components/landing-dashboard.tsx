"use client";

import { useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  FileClock,
  FilePlus2,
  FileText,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import type {
  StatementDashboardSummary,
  StatementReportRecord,
  WorkspaceUser,
} from "@/lib/statement-report";

interface LandingDashboardProps {
  user: WorkspaceUser;
  records: StatementReportRecord[];
  summary: StatementDashboardSummary;
  onStartAnalysis: () => void;
  onLogout: () => void;
}

function buildActivity(summary: StatementDashboardSummary) {
  const byDate = new Map(summary.activity.map((entry) => [entry.date, entry]));
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return date;
  });

  return dates.map((date) => {
    const counts = byDate.get(date.toISOString().slice(0, 10));
    return {
      day: date.toLocaleDateString(undefined, { weekday: "short" }),
      successful: counts?.successful ?? 0,
      failed: counts?.failed ?? 0,
    };
  });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status: StatementReportRecord["status"] }) {
  const success = status === "success";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        success
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
          : "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
      }`}
    >
      {success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {success ? "Successful" : "Failed"}
    </span>
  );
}

export function LandingDashboard({
  user,
  records,
  summary,
  onStartAnalysis,
  onLogout,
}: LandingDashboardProps) {
  const [search, setSearch] = useState("");
  const filteredRecords = records.filter((record) =>
    `${record.fileName} ${record.integrityStatus ?? ""} ${record.status}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );
  const successful = summary.successful;
  const failed = summary.failed;
  const successRate = summary.total
    ? Math.round((successful / summary.total) * 100)
    : 0;
  const activity = buildActivity(summary);
  const firstName = user.name.split(" ")[0] || "there";

  return (
    <div className="min-h-screen bg-[#f4f7fc] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 lg:flex">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-[#F9FBFA] shadow-sm ring-1 ring-[#183238]/10">
              <img src="/logo.png" alt="Statement Analyzer logo" className="h-7 w-7 object-contain" />
            </div>
            <div className="text-sm font-bold leading-tight text-[#102d55]">
              Statement
              <span className="block text-[#183238]">Analyzer</span>
            </div>
          </div>

          <p className="mb-2 mt-10 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Workspace
          </p>
          <nav className="space-y-1">
            <a
              href="#dashboard"
              className="flex items-center gap-3 rounded-xl bg-[#183238] px-3.5 py-3 text-sm font-semibold text-white shadow-md shadow-[#183238]/15"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </a>
            <button
              type="button"
              onClick={onStartAnalysis}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <UploadCloud className="h-4 w-4" />
              Analyze statement
            </button>
            <a
              href="#history"
              className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <FileClock className="h-4 w-4" />
              Analysis history
            </a>
          </nav>

          <div className="mt-auto rounded-2xl border border-[#183238]/10 bg-gradient-to-br from-[#EAF3F4] to-[#F5FAFB] p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#183238] shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-800">Organization workspace</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Sign-in is verified by Active Directory. Report summaries are stored in MySQL.
            </p>
          </div>
        </aside>

        <main id="dashboard" className="min-w-0 flex-1 px-4 py-5 sm:px-7 sm:py-7 xl:px-10">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div className="min-w-0 flex-1">
              <div className="relative max-w-md">
                <Activity className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  aria-label="Search analysis history"
                  placeholder="Search statements or history..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#183238] focus:ring-4 focus:ring-[#183238]/10"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden text-xs font-medium text-slate-500 sm:inline">
                Active Directory
              </span>
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EAF3F4] text-xs font-bold text-[#183238]">
                  {user.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="max-w-[130px] truncate text-xs font-semibold text-slate-700">
                  {user.name}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="gap-2 text-slate-500 hover:text-rose-600"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </header>

          <section className="flex flex-wrap items-end justify-between gap-4 py-7">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#183238]">
                <Sparkles className="h-3.5 w-3.5" />
                Your analysis workspace
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#102d55] sm:text-3xl">
                Welcome back, {firstName} <span aria-hidden="true">👋</span>
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Here&apos;s your statement activity. History is temporary until database storage is enabled.
              </p>
            </div>
            <Button
              type="button"
              onClick={onStartAnalysis}
              className="h-11 gap-2 rounded-xl bg-[#183238] px-5 font-semibold text-white shadow-lg shadow-[#183238]/20 hover:bg-[#224a52]"
            >
              <FilePlus2 className="h-4 w-4" />
              Analyze a statement
              <ArrowRight className="h-4 w-4" />
            </Button>
          </section>

          <section aria-label="Analysis summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={<FileText className="h-5 w-5" />}
              label="Statements analyzed"
              value={summary.total}
              detail="Analysis attempts in this page session"
              tone="blue"
            />
            <SummaryCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="Successful"
              value={successful}
              detail="Statements parsed successfully"
              tone="green"
            />
            <SummaryCard
              icon={<XCircle className="h-5 w-5" />}
              label="Failed"
              value={failed}
              detail="Could not be analyzed"
              tone="red"
            />
            <SummaryCard
              icon={<BarChart3 className="h-5 w-5" />}
              label="Success rate"
              value={`${successRate}%`}
              detail={records.length ? "Based on your analysis history" : "Updates after your first analysis"}
              tone="violet"
            />
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Analysis activity</h2>
                  <p className="mt-1 text-xs text-slate-500">Successful and failed attempts over the last 7 days</p>
                </div>
                <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-500">
                  Last 7 days
                </span>
              </div>
              <div className="mt-5 h-[235px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activity} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={5}>
                    <CartesianGrid stroke="#edf1f7" vertical={false} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#01562d", fontSize: 12 }} dy={8} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#01562d", fontSize: 11 }} />
                    <Tooltip
                      cursor={{ fill: "#f8fafc" }}
                      contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="successful" name="Successful" fill="#19b785" radius={[5, 5, 0, 0]} maxBarSize={24} />
                    <Bar dataKey="failed" name="Failed" fill="#f07474" radius={[5, 5, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
                {!records.length && (
                  <p className="pointer-events-none -mt-[128px] text-center text-xs text-slate-400">
                    Your activity will appear here after your first analysis.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#183238] via-[#224a52] to-[#102d35] p-6 text-white shadow-md">
              <div>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
                  <UploadCloud className="h-5 w-5" />
                </span>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#D9F36B]">
                  Get started
                </p>
                <h2 className="mt-2 text-xl font-bold leading-snug">
                  Turn your next statement into a clearer financial picture.
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#F9FBFA]/80">
                  Upload a PDF, CSV, or spreadsheet and review transactions, balances, and cash flow.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={onStartAnalysis}
                className="mt-6 h-11 justify-between rounded-xl bg-white font-semibold text-[#183238] hover:bg-[#F9FBFA]"
              >
                Upload statement
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </section>

          <section id="history" className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-base font-bold text-slate-800">Recent analyses</h2>
                <p className="mt-1 text-xs text-slate-500">Temporary history; cleared on refresh or sign-out</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500">
                <Clock3 className="h-3.5 w-3.5" />
                {filteredRecords.length} of {records.length} recent records
              </span>
            </div>
            {filteredRecords.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[660px] text-left text-sm">
                  <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold sm:px-6">Statement</th>
                      <th className="px-4 py-3 font-semibold">Date analyzed</th>
                      <th className="px-4 py-3 font-semibold">Transactions</th>
                      <th className="px-4 py-3 font-semibold">Integrity review</th>
                      <th className="px-5 py-3 text-right font-semibold sm:px-6">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.map((record) => (
                      <tr
                        key={record.id}
                        data-history-row={`${record.fileName} ${record.integrityStatus ?? ""} ${record.status}`.toLowerCase()}
                        className="transition hover:bg-slate-50/70"
                      >
                        <td className="max-w-[240px] px-5 py-4 sm:px-6">
                          <span className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF3F4] text-[#183238]">
                              <FileText className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span title={record.fileName} className="block truncate font-semibold text-slate-800">
                                {record.fileName}
                              </span>
                              {record.failureMessage && (
                                <span title={record.failureMessage} className="mt-0.5 block truncate text-xs text-rose-600">
                                  {record.failureMessage}
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">
                          {formatDate(record.analyzedAt)}
                        </td>
                        <td className="px-4 py-4 text-xs font-medium text-slate-600">
                          {record.status === "success" ? record.transactionCount.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-600">
                          {record.integrityStatus
                            ? record.integrityStatus.replaceAll("_", " ")
                            : "Not available"}
                        </td>
                        <td className="px-5 py-4 text-right sm:px-6">
                          <StatusPill status={record.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center px-5 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF3F4] text-[#183238]">
                  <FileCheck2 className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-slate-800">No analysis history yet</h3>
                <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                  Upload your first bank statement to see its result and transaction count here.
                </p>
                <Button type="button" onClick={onStartAnalysis} variant="outline" className="mt-4 gap-2 rounded-xl">
                  Analyze a statement
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-2 px-1 py-5 text-[11px] text-slate-400">
            <span>Statement Analyzer · Organization workspace</span>
            <span>AD-authenticated session · Report summaries only</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
  tone: "blue" | "green" | "red" | "violet";
}) {
  const colors = {
    blue: "bg-[#EAF3F4] text-[#183238]",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-rose-50 text-rose-600",
    violet: "bg-violet-50 text-violet-600",
  }[tone];
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[#102d55]">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors}`}>{icon}</span>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">{detail}</p>
    </article>
  );
}
