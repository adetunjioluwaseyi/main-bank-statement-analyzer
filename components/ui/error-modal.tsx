"use client";

import { AlertCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ErrorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  message?: string | null;
}

export function ErrorModal({
  open,
  onOpenChange,
  title = "Something went wrong",
  message,
}: ErrorModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-red-200 bg-red-50 p-6">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-3 text-red-600">
            <div className="rounded-full bg-red-100 p-2">
              <AlertCircle className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl font-semibold text-red-700">
              {title}
            </DialogTitle>
          </div>
          {message ? (
            <DialogDescription className="text-sm leading-6 text-red-700">
              {message}
            </DialogDescription>
          ) : null}
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
