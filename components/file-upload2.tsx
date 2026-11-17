// components/file-upload.tsx
"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Loader2, Files, UserCheck } from "lucide-react";
import type { CSVData } from "@/app/page2";
import { ErrorModal } from "@/components/ui/error-modal";

interface FileUploadProps {
  onFileUpload: (data: CSVData) => void;
  disabled?: boolean;
}

export function FileUpload({ onFileUpload, disabled }: FileUploadProps) {
  // Mode selection: "single" or "multi"
  const [analysisMode, setAnalysisMode] = useState<"single" | "multi">("single");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!acceptedFiles || acceptedFiles.length === 0) return;
      setError(null);

      // Validation safeguard based on mode selected
      if (analysisMode === "multi" && acceptedFiles.length < 2) {
        setError("Multi-Account mode requires at least 2 bank statements to track and reconcile inter-account flows.");
        return;
      }

      setIsLoading(true);

      try {
        if (analysisMode === "single") {
          // --- SINGLE STATEMENT WORKFLOW ---
          setLoadingMessage("Auditing statement for visual/font tampering & ledger math...");
          const file = acceptedFiles[0];
          const formData = new FormData();
          formData.append("file", file);

          const response = await fetch("http://localhost:8000/api/v1/analyze", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Single statement analysis failed with status: ${response.status}`);
          }

          const result = await response.json();

          onFileUpload({
            headers: result.headers,
            rows: result.rows,
            fileName: file.name,
            fileSize: file.size,
            metadata: {
              accountHolder: result.account_name || "Account Holder",
              openingBalance: result.openingBalance,
              closingBalance: result.closingBalance,
              integrityStatus: result.status,
              integrityScore: result.status === "VERIFIED" ? 99 : 45,
              integrityWarnings: result.forensics?.reasons || [],
            },
          });
        } else {
          // --- MULTI-STATEMENT PORTFOLIO WORKFLOW ---
          setLoadingMessage(
            `Auditing ${acceptedFiles.length} statements, running tamper checks & neutralizing contra transfers...`
          );
          const formData = new FormData();
          acceptedFiles.forEach((file) => {
            formData.append("files", file);
          });

          const response = await fetch("http://localhost:8000/api/v1/analyze-client-portfolio", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Multi-account analysis failed with status: ${response.status}`);
          }

          const result = await response.json();

          const firstStatement = result.individual_statements?.[0];
          const lastStatement = result.individual_statements?.[result.individual_statements.length - 1];
          const sameAmountPatterns = Array.isArray(result.same_amount_suspicious_patterns)
            ? result.same_amount_suspicious_patterns
            : [];

          onFileUpload({
            headers: result.headers,
            rows: result.rows,
            fileName: `Client Portfolio (${acceptedFiles.length} Accounts)`,
            fileSize: acceptedFiles.reduce((sum: number, f: File) => sum + f.size, 0),
            metadata: {
              accountHolder:
                result.individual_statements?.[0]?.account_name || "Consolidated Client",
              openingBalance: firstStatement?.opening_balance ?? result.flow_summary?.gross_turnover ?? 0,
              closingBalance: lastStatement?.closing_balance ?? result.flow_summary?.net_operational_cashflow ?? 0,
              integrityStatus: result.portfolio_forensic_status,
              integrityScore:
                result.portfolio_forensic_status === "VERIFIED" ? 98 : 45,
              integrityWarnings: [
                ...(result.tamper_alerts || []),
                ...(sameAmountPatterns.length > 0
                  ? sameAmountPatterns.map((pattern: any) =>
                      `Same-amount suspicious pattern: ₦${Number(pattern.amount || 0).toLocaleString()} across ${pattern.count || 0} transfers.`
                    )
                  : []),
                `Deduplicated ${result.flow_summary?.internal_transfer_events_count || 0} internal transfers across accounts.`,
                `Filtered ₦${(result.flow_summary?.internal_transfers_deducted || 0).toLocaleString()} in circular movements.`,
                `True Operational Expense: ₦${(result.flow_summary?.true_operational_expense || 0).toLocaleString()}`,
              ],
            },
          });
        }
      } catch (err: any) {
        console.error("Analysis error:", err);
        setError(err.message || "An error occurred while connecting to the forensic ML backend.");
      } finally {
        setIsLoading(false);
      }
    },
    [analysisMode, onFileUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    multiple: analysisMode === "multi", // Enforce single selection in single mode
    disabled: disabled || isLoading,
    accept: { "application/pdf": [".pdf"] },
  });

  return (
    <div className="space-y-6">
      {/* Mode Selection Tabs */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => {
            setAnalysisMode("single");
            setError(null);
          }}
          disabled={isLoading}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
            analysisMode === "single"
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-background text-muted-foreground border-border hover:bg-muted/60"
          }`}
        >
          <UserCheck className="h-4 w-4" />
          Single Bank Statement
        </button>

        <button
          type="button"
          onClick={() => {
            setAnalysisMode("multi");
            setError(null);
          }}
          disabled={isLoading}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
            analysisMode === "multi"
              ? "bg-primary text-primary-foreground border-primary shadow-sm"
              : "bg-background text-muted-foreground border-border hover:bg-muted/60"
          }`}
        >
          <Files className="h-4 w-4" />
          Multi-Account Client Portfolio (2+ Statements)
        </button>
      </div>

      {/* Dynamic Dropzone Area */}
      <div
        {...getRootProps()}
        className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-border/80 hover:border-primary/50 hover:bg-muted/30"
        } ${disabled || isLoading ? "pointer-events-none opacity-60" : ""}`}
      >
        <input {...getInputProps()} />

        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-9 w-9 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">{loadingMessage}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5 max-w-md">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Upload className="h-6 w-6" />
            </div>

            {analysisMode === "single" ? (
              <>
                <p className="text-base font-semibold">
                  Upload Single Statement (PDF)
                </p>
                <p className="text-xs text-muted-foreground">
                  Performs high-depth visual & font tamper detection, template verification, and chronological ledger extraction.
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold">
                  Upload Multiple Bank Statements (PDFs)
                </p>
                <p className="text-xs text-muted-foreground">
                  Select 2 or more statements for the same client (e.g., Zenith + Stanbic + Moniepoint) to track fund flows and eliminate duplicate expenses.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <ErrorModal
        open={Boolean(error)}
        onOpenChange={(open) => !open && setError(null)}
        title="Upload failed"
        message={error}
      />
    </div>
  );
}