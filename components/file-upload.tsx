// components/file-upload.tsx
"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Loader2, Files, UserCheck } from "lucide-react";
import type { CSVData } from "@/app/page";
import { ErrorModal } from "@/components/ui/error-modal";

interface FileUploadProps {
  onFileUpload: (data: CSVData) => void;
  onBatchUpload?: (batch: CSVData[]) => void;
  onAppendStatement?: (data: CSVData) => void;
  onCurrencyDetected?: (currency: any) => void;
  onFileError?: (fileName: string, error: string) => void;
  fileNumber?: number;
  hasExistingStatement?: boolean;
  disabled?: boolean;
}

export function FileUpload({
  onFileUpload,
  onBatchUpload,
  disabled,
}: FileUploadProps) {
  const [analysisMode, setAnalysisMode] = useState<"single" | "multi">("single");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!acceptedFiles || acceptedFiles.length === 0) return;
      setError(null);

      // Auto-detect multi mode if user dragged > 1 file even if single tab was active
      const isMulti = analysisMode === "multi" || acceptedFiles.length > 1;

      setIsLoading(true);

      try {
        if (!isMulti) {
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

          const singleStmt: CSVData = {
            headers: result.headers || ["Date", "Description", "Debit", "Credit", "Balance"],
            rows: result.rows || [],
            fileName: file.name,
            fileSize: file.size,
            metadata: {
              bankProvider: result.bank_provider || "Unknown Bank",
              accountNumber: result.account_number || "",
              accountHolder: result.account_name || "Account Holder",
              accountName: result.account_name || "Account Holder",
              openingBalance: result.openingBalance ?? 0,
              closingBalance: result.closingBalance ?? 0,
              totalDebits: result.totalOutflow ?? 0,
              totalCredits: result.totalInflow ?? 0,
              sha256: result.sha256,
              integrityStatus: result.status,
              integrityScore: result.forensics?.confidence ? Math.round(result.forensics.confidence * 100) : 95,
              integrityWarnings: result.forensics?.reasons || [],
            },
          };

          onFileUpload(singleStmt);
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

          // 1. Construct separate CSVData records for each uploaded account
          const parsedStatements: CSVData[] = (result.individual_statements || []).map(
            (stmt: any, idx: number) => {
              const matchingFile = acceptedFiles.find(
                (f) => f.name.toLowerCase() === (stmt.fileName || "").toLowerCase()
              ) || acceptedFiles[idx];

              const formattedRows = (stmt.transactions || []).map((tx: any) => [
                tx.date || "",
                tx.description || "",
                tx.debit > 0 ? String(tx.debit) : "-",
                tx.credit > 0 ? String(tx.credit) : "-",
                String(tx.balance ?? 0),
              ]);

              return {
                headers: ["Date", "Description", "Debit", "Credit", "Balance"],
                rows: formattedRows,
                fileName: stmt.fileName || matchingFile?.name || `Statement ${idx + 1}`,
                fileSize: matchingFile?.size || 0,
                metadata: {
                  bankProvider: stmt.bank_provider || (stmt.fileName?.toUpperCase().includes("UNION") ? "Union Bank" : stmt.fileName?.toUpperCase().includes("FIDELITY") ? "Fidelity Bank" : `Bank Account ${idx + 1}`),
                  accountNumber: stmt.account_number || "",
                  accountHolder: stmt.account_name || "Account Holder",
                  accountName: stmt.account_name || "Account Holder",
                  openingBalance: stmt.opening_balance ?? 0,
                  closingBalance: stmt.closing_balance ?? 0,
                  totalDebits: stmt.total_outflow ?? 0,
                  totalCredits: stmt.total_inflow ?? 0,
                  sha256: stmt.sha256,
                  integrityStatus: stmt.forensics?.status || "VERIFIED",
                  integrityScore: stmt.forensics?.confidence
                    ? Math.round(stmt.forensics.confidence * 100)
                    : 98,
                  integrityWarnings: stmt.forensics?.reasons || [],
                },
              };
            }
          );

          // 2. Prepare metadata for the unified consolidated portfolio
          const individualAccounts = parsedStatements.map((s) => ({
            bank: s.metadata?.bankProvider || s.fileName,
            accountNumber: s.metadata?.accountNumber || "",
            openingBalance: s.metadata?.openingBalance ?? 0,
            closingBalance: s.metadata?.closingBalance ?? 0,
            fileName: s.fileName,
          }));

          const interAccountAlerts = 
            result.inter_account_alerts || 
            result.flow_summary?.detected_internal_movements || 
            [];

          const combinedRows = parsedStatements.flatMap((s) => s.rows);

          const consolidatedStatement: CSVData = {
            headers: ["Date", "Description", "Debit", "Credit", "Balance"],
            rows: combinedRows.length > 0 ? combinedRows : result.rows || [],
            fileName: `Client Portfolio (${acceptedFiles.length} Accounts)`,
            fileSize: acceptedFiles.reduce((sum: number, f: File) => sum + f.size, 0),
            metadata: {
              accountHolder: result.individual_statements?.[0]?.account_name || "Consolidated Client",
              accountName: result.individual_statements?.[0]?.account_name || "Consolidated Client",
              bankProvider: parsedStatements.map((p) => p.metadata?.bankProvider).filter(Boolean).join(" & "),
              openingBalance: parsedStatements[0]?.metadata?.openingBalance ?? 0,
              closingBalance: parsedStatements[parsedStatements.length - 1]?.metadata?.closingBalance ?? 0,
              totalDebits: result.flow_summary?.total_gross_outflow ?? 0,
              totalCredits: result.flow_summary?.total_gross_inflow ?? 0,
              integrityStatus: result.portfolio_forensic_status || "VERIFIED",
              integrityScore: result.portfolio_forensic_status === "VERIFIED" ? 98 : 45,
              individualAccounts: individualAccounts,
              interAccountAlerts: interAccountAlerts,
              circularTurnover: result.circular_turnover_percentage || 0,
              trueRevenue: result.true_operational_revenue || 0,
              integrityWarnings: result.tamper_alerts || [],
            } as any,
          };

          // 3. Dispatch to both batch and active statement
          if (onBatchUpload) {
            onBatchUpload(parsedStatements);
          }
          onFileUpload(consolidatedStatement);
        }
      } catch (err: any) {
        console.error("Analysis error:", err);
        setError(err.message || "An error occurred while connecting to the forensic ML backend.");
      } finally {
        setIsLoading(false);
      }
    },
    [analysisMode, onFileUpload, onBatchUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    multiple: true,
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
                  Performs high-depth visual &amp; font tamper detection, template verification, and chronological ledger extraction.
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold">
                  Upload Multiple Bank Statements (PDFs)
                </p>
                <p className="text-xs text-muted-foreground">
                  Select 2 or more statements for the same client (e.g., Union Bank + Fidelity Bank) to track fund flows and reconcile contra transfers.
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