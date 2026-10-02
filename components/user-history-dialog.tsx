'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { fetchUserUploads, UploadRecord } from '@/lib/admin-service';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileSpreadsheet, History, RefreshCw, Calendar, TrendingUp, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface UserHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserHistoryDialog({ open, onOpenChange }: UserHistoryDialogProps) {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const records = await fetchUserUploads(user.uid);
      setUploads(records || []);
    } catch (err) {
      console.error(err);
      toast.error('Could not load upload history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && user) {
      loadHistory();
    }
  }, [open, user]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between pb-3 border-b">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              <DialogTitle className="text-lg font-bold">My Statement Analyses</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Bank statements parsed and preserved under your account.
            </DialogDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadHistory}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-2">
          {uploads.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground flex flex-col items-center">
              <FileSpreadsheet className="w-10 h-10 text-muted-foreground/40 mb-2" />
              <p className="font-semibold text-sm text-foreground">No statements saved yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                When you upload CSV bank statements while logged in, your cash-flow summaries and underwriting records will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {uploads.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-semibold text-sm text-foreground">{item.fileName}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-mono ${
                          (item.healthScore || 0) >= 70
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : (item.healthScore || 0) >= 50
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-red-50 text-red-800 border-red-300'
                        }`}
                      >
                        Score: {item.healthScore || 0}/100
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(item.uploadedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      <span>•</span>
                      <span>{item.rowCount || 0} transactions</span>
                      <span>•</span>
                      <span>{Math.round((item.fileSize || 0) / 1024)} KB</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground uppercase font-sans">
                        Closing Balance
                      </div>
                      <div className="font-bold text-foreground">
                        ${(item.closingBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground uppercase font-sans">
                        Net Cash Flow
                      </div>
                      <div
                        className={`font-bold ${
                          (item.netCashFlow || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {(item.netCashFlow || 0) >= 0 ? '+' : ''}$
                        {(item.netCashFlow || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
