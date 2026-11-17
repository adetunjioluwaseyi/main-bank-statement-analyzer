'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  TrendingUp,
  FileSpreadsheet,
  FileDown,
  Lock,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Users,
  EyeOff,
  Building2,
  RefreshCw,
} from 'lucide-react';

export function AuthGateway() {
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setLoading(true);
    window.location.assign('/');
  };

  return (
    <div className="min-h-screen bg-[#0d1f23] text-slate-100 flex flex-col justify-between selection:bg-[#47705d] selection:text-white">
      {/* Top Bar */}
      <header className="border-b border-white/10 px-6 py-4 sm:px-10">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#47705d] text-[#e8f5e9] shadow-sm">
              <RefreshCw className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-white block">
                Statement Analyzer & Underwriter
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-400 block font-medium">
                Fintech & Lending Intelligence
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 font-mono text-[11px]">
              <Lock className="w-3 h-3 text-emerald-400" />
              SOC-2 Type II & PII Redaction Ready
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center py-12 px-6 sm:px-10">
        <div className="mx-auto max-w-7xl w-full grid gap-12 lg:grid-cols-12 lg:gap-8 items-center">
          
          {/* Left Column: Product Value & Capabilities */}
          <div className="lg:col-span-7 space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-300">
              <Sparkles className="w-3.5 h-3.5" />
              Authentication Required for Underwriting Workspace
            </div>

            <div className="space-y-4">
              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.15]">
                Turn bank statements into actionable <span className="text-emerald-400">lending signals</span>.
              </h1>
              <p className="text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
                Automated multi-currency cash-flow analysis, opening & closing balance tracking, forensic risk audits, and institutional credit memo generation for modern fintechs and lenders.
              </p>
            </div>

            {/* Feature Grid */}
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                  <TrendingUp className="w-4 h-4" />
                  <span>Cash-Flow & Balance Tracking</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Accurate calculation of opening and closing balances, net flow, average daily balance, and minimum cushion reserves.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Monthly & Weekly Breakdown</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Granular periodic inflow/outflow distribution tables with transaction velocity and volatility monitoring.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                  <EyeOff className="w-4 h-4" />
                  <span>Forensics & PII Redaction</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Real-time detection of high-risk transactions, round amounts, gambling/crypto, and one-click PII data masking.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                  <FileDown className="w-4 h-4" />
                  <span>PDF Reports & Credit Memos</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Executive-ready Credit Committee Memos and formatted multi-page PDF exports ready for lending approval workflows.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Zero Bank Credentials Stored
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Multi-Currency (NGN, USD, EUR, GBP, KES, ZAR, GHS)
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Enterprise Role-Based Access
              </span>
            </div>
          </div>

          {/* Right Column: Authentication Card */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/15 bg-[#122b31] p-8 sm:p-10 shadow-2xl space-y-6 relative overflow-hidden">
              {/* Subtle decorative glow */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="space-y-2 relative">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 mb-2">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  Sign in with your organization
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Use your Active Directory username and password to access the statement analysis workspace. Reports are stored in MySQL.
                </p>
              </div>

              {/* Login Action Button */}
              <div className="space-y-4 pt-2">
                <Button
                  id="gateway-ad-signin-btn"
                  onClick={handleLogin}
                  disabled={loading}
                  size="lg"
                  className="w-full h-12 text-sm font-semibold flex items-center justify-center gap-3 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-950 transition-all shadow-md active:scale-[0.99]"
                >
                  <Building2 className="h-5 w-5" />
                  {loading ? 'Opening sign-in...' : 'Continue with Active Directory'}
                </Button>

                <p className="text-[11px] text-center text-slate-400">
                  New users are automatically enrolled in the standard analyst tier upon their first login.
                </p>
              </div>

              {/* Security & Admin callout */}
              <div className="pt-4 border-t border-white/10 space-y-3">
                <div className="flex items-start gap-2 text-xs text-slate-300">
                  <Building2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Admin Management:</strong> Designated administrators gain instant access to the user directory, statement ledger, and suspension controls.
                  </span>
                </div>
                <div className="flex items-start gap-2 text-xs text-slate-300">
                  <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Privacy Guard:</strong> Parse statements in-memory with strict client-side encryption and instant zero-retention controls.
                  </span>
                </div>
              </div>

              <div className="bg-white/5 rounded-lg p-3 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Underwriting Engine: v2.4</span>
                <span className="text-emerald-400 font-mono">Status: Operational</span>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-4 text-center text-xs text-slate-400">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Statement Analyzer. Designed for Credit Teams & Underwriters.</p>
          <div className="flex items-center gap-4">
            <span>Client-Side PII Redaction</span>
            <span>•</span>
            <span>MySQL Audited</span>
            <span>•</span>
            <span>Bank-Grade Encryption</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
