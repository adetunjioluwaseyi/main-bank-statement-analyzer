'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import { ShieldCheck, FileSpreadsheet, Lock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await loginWithGoogle();
      toast.success('Successfully logged in with Google');
      onOpenChange(false);
    } catch (err: unknown) {
      console.error(err);
      toast.error('Google sign-in failed. Please check popup permissions.');
    } finally {
      setLoading(false);
    }
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
            Use your Google account to save underwriting analyses, generate certified PDF reports, and view statement audit histories.
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
            id="modal-google-signin-btn"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-11 text-sm font-semibold flex items-center justify-center gap-3 bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 shadow-xs"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            {loading ? 'Connecting with Google...' : 'Continue with Google (Gmail)'}
          </Button>

          <p className="text-[11px] text-center text-muted-foreground mt-3 flex items-center justify-center gap-1">
            <Lock className="w-3 h-3" />
            <span>End-to-end encrypted with Firebase Authentication & Firestore</span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
