'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Lock, CheckCircle2, Building2 } from 'lucide-react';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const goToActiveDirectorySignIn = () => {
    onOpenChange(false);
    window.location.assign('/');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-6">
        <DialogHeader className="text-center sm:text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-1">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight">
            Sign in to Statement Analyzer
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Sign in with your organization&apos;s Active Directory account to save analysis summaries and view your report history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-3">
          <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>Securely save and retrieve all parsed bank statement evaluations</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>Institutional cash-flow analysis, monthly breakdowns, and credit memos</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>Admin-governed workspace with complete audit transparency</span>
          </div>
        </div>

        <div className="pt-2">
          <Button
            id="modal-ad-signin-btn"
            onClick={goToActiveDirectorySignIn}
            className="w-full h-11 text-sm font-semibold flex items-center justify-center gap-3 bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 shadow-xs"
          >
            <Building2 className="h-4 w-4" />
            Continue with Active Directory
          </Button>

          <p className="text-[11px] text-center text-muted-foreground mt-3 flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" />
            <span>AD-verified sign-in · HTTP-only server session · MySQL report history</span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
