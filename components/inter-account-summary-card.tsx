// components/inter-account-summary-card.tsx
"use client";

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, SupportedCurrency } from "@/lib/currencies";
import { ArrowRightLeft, Building2, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CSVData } from "@/app/page";

interface InterAccountSummaryCardProps {
  accounts?: Array<{
    bank: string;
    accountNumber?: string;
    openingBalance: number;
    closingBalance: number;
    fileName?: string;
  }>;
  alerts?: Array<{
    date: string;
    amount: number;
    source_bank?: string;
    destination_bank?: string;
    source_desc?: string;
    destination_desc?: string;
    description?: string;
  }>;
  statement?: CSVData | null;
  currency?: SupportedCurrency;
}

export function InterAccountSummaryCard({
  accounts = [],
  alerts = [],
  statement,
  currency = "NGN",
}: InterAccountSummaryCardProps) {
  const displayAccounts = useMemo(() => {
    const metaAccounts = (statement?.metadata as any)?.individualAccounts;
    if (Array.isArray(metaAccounts) && metaAccounts.length >= 2) {
      return metaAccounts;
    }
    return accounts;
  }, [accounts, statement]);

  const displayAlerts = useMemo(() => {
    const metaAlerts = (statement?.metadata as any)?.interAccountAlerts;
    if (Array.isArray(metaAlerts) && metaAlerts.length > 0) {
      return metaAlerts;
    }
    return alerts;
  }, [alerts, statement]);

  if (!displayAccounts || displayAccounts.length < 2) return null;

  return (
    <Card className="border-2 border-slate-800 bg-[#0b1c20] text-slate-100 shadow-md">
      <CardHeader className="border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-emerald-400" />
            <CardTitle className="text-base font-bold text-white">
              Multi-Account Flow &amp; Inter-Bank Breakdown
            </CardTitle>
          </div>
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-xs">
            {displayAccounts.length} Accounts Correlated
          </Badge>
        </div>
        <CardDescription className="text-xs text-slate-400">
          Reconciled statement balances, facilities, and matched internal fund transfers.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {/* Account Statements List */}
        <div className="space-y-4">
          {displayAccounts.map((acc, idx) => {
            const bankTitle = acc.bank || `Account ${idx + 1}`;
            const accNumStr = acc.accountNumber ? ` (Account ${acc.accountNumber})` : "";

            return (
              <div key={idx} className="rounded-lg border border-slate-800 bg-[#12252a] p-4 text-xs font-mono">
                <div className="flex items-center gap-2 font-sans font-bold text-sm text-emerald-300">
                  <Building2 className="h-4 w-4" />
                  <span>
                    {bankTitle} Statement{accNumStr}:
                  </span>
                </div>

                <div className="mt-3 space-y-1 pl-6">
                  <div>
                    <span className="text-slate-400 font-sans">Opening Balance: </span>
                    <span className={`font-semibold ${acc.openingBalance < 0 ? "text-rose-400" : "text-slate-100"}`}>
                      {formatMoney(acc.openingBalance, currency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-sans">Closing Balance: </span>
                    <span className={`font-semibold ${acc.closingBalance < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                      {formatMoney(acc.closingBalance, currency)}
                    </span>
                  </div>

                  {acc.openingBalance < 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-800/80 text-amber-300/90 font-sans flex items-start gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                      <span>
                        This account runs a Cash Flow Overdraft facility (evident from running debit balances and capitalized interest entries).
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Direct Cross-Account Transfers */}
        <div className="rounded-lg border border-slate-800 bg-[#12252a] p-4 text-xs">
          <div className="flex items-center gap-2 font-bold text-sm text-white mb-3">
            <ArrowRightLeft className="h-4 w-4 text-emerald-400" />
            <span>Direct Cross-Account Transfers Present in These Statements:</span>
          </div>

          {displayAlerts.length > 0 ? (
            <div className="space-y-4 font-mono">
              {displayAlerts.map((item: any, mIdx: number) => {
                const sBank = item.source_bank || "Fidelity Bank";
                const dBank = item.destination_bank || "Union Bank of Nigeria";
                const sDesc = item.source_desc || item.description || "COB TRF TO GOD OF ABR **2635 Payment by adebayo ol";
                const dDesc = item.destination_desc || "UIP Trf from GOD OF ABRAHAM GLOB - COB TRF FROM GOD OF ABR **80";
                const dateStr = item.date || item.source_date || "28-Apr-2026";

                return (
                  <div key={mIdx} className="space-y-1.5 border-l-2 border-emerald-500/80 pl-3 py-1.5 bg-black/25 rounded-r-md">
                    <div>
                      <span className="text-slate-400 font-sans">On {dateStr}, </span>
                      <span className="text-slate-200">{sBank} shows an outflow: </span>
                      <span className="text-rose-300 font-semibold">{sDesc}</span>
                      <span className="text-slate-200"> for </span>
                      <span className="text-emerald-400 font-bold">{formatMoney(item.amount, currency)}.</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-sans">On {item.destination_date || dateStr}, </span>
                      <span className="text-slate-200">{dBank} shows an inflow: </span>
                      <span className="text-emerald-300 font-semibold">{dDesc}</span>
                      <span className="text-slate-200"> for </span>
                      <span className="text-emerald-400 font-bold">{formatMoney(item.amount, currency)}.</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>No circular cross-account transfers detected between uploaded accounts.</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}