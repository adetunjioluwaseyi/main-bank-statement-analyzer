'use client';

import React from 'react';
import { useAuth } from '@/context/auth-context';
import { AlertTriangle, Mail } from 'lucide-react';

export function SuspendedBanner() {
  const { isSuspended, profile } = useAuth();

  if (!isSuspended) return null;

  return (
    <div className="w-full bg-red-600 text-white px-4 py-2.5 shadow-sm text-xs">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-white shrink-0 animate-bounce" />
          <span className="font-semibold">
            Account Suspended: Your access has been restricted by an administrator.
          </span>
          <span className="hidden md:inline opacity-90">
            Statement upload and processing are temporarily disabled for this account.
          </span>
        </div>
        <a
          href="mailto:adetunjiiretomiwa@gmail.com?subject=Statement%20Analyzer%20Account%20Reactivation%20Request"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-medium transition-colors"
        >
          <Mail className="w-3 h-3" />
          Contact Admin (adetunjiiretomiwa@gmail.com)
        </a>
      </div>
    </div>
  );
}
