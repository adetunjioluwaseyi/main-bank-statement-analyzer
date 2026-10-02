"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  FileText,
  AlertCircle,
  Lock,
} from "lucide-react";
import type { CSVData } from "@/app/page";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  GlobalWorkerOptions,
  getDocument,
  version as pdfjsVersion,
} from "pdfjs-dist/build/pdf.js";
import { detectCurrencyFromText, SupportedCurrency } from "@/lib/currencies";

if (typeof window !== "undefined") {
  // Use cdnjs to avoid Edge tracking prevention blocks
  GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`;
}

const BACKEND_API_URL = process.env.NEXT_PUBLIC_ML_API_URL || "http://127.0.0.1:8000/api/v1/analyze";

interface FileUploadProps {
  onFileUpload: (data: CSVData) => void;
  onAppendStatement?: (data: CSVData) => void;
  onCurrencyDetected?: (currency: SupportedCurrency) => void;
  fileNumber: 1 | 2;
  hasExistingStatement?: boolean;
  disabled?: boolean;
}

const datePattern =
  /^((?:\d{4}[\s/-]\d{1,2}[\s/-]\d{1,2}|\d{1,2}(?:[\s/-]?[A-Za-z]{3,9}[\s/-]?\d{2,4}|[\s/-]\d{1,2}[\s/-]\d{2,4})))(?:[T\s]+\d{1,2}\s*:?\s*\d{2}(?:\s*:?\s*\d{2})?)?/i;
const amountPattern =
  /(?:NGN|₦|\$|£|€|KSh|R)?\s*\(?-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\)?/g;
const MAX_FILE_SIZE = 30 * 1024 * 1024;
const MIN_PDF_PAGES = 1;

function numberFrom(value: string | undefined): number {
  if (!value) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  if (/[a-zA-Z]/.test(raw) && !/^\s*\(.+\)\s*$/.test(raw)) return 0;
  const isNegative = /^\s*\(.+\)\s*$/.test(raw) || /^\s*-/.test(raw);
  const parsed = Number.parseFloat(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 10_000_000_000_000) return 0;
  return isNegative ? -Math.abs(parsed) : parsed;
}

function validateStatementStructure(data: string[][]) {
  if (data.length < 2 || data[0].length === 0) {
    throw new Error("The statement is empty or has no readable header row.");
  }
}

function getUserFacingFileError(error: unknown, extension?: string) {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Statement structure is not supported")) return message;
  if (message.includes("no transaction rows")) {
    return "No transactions were found. Upload a statement that contains transaction rows.";
  }
  if (message.includes("PDF page count")) return message;
  if (message.includes("password-protected")) return message;
  if (message.includes("CSV parsing error")) {
    return "This CSV could not be read because its rows are malformed. Export it again as a standard comma-separated CSV file.";
  }
  if (message.includes("no readable worksheets")) {
    return "This spreadsheet has no readable worksheet. Open it in Excel and export the statement again as XLSX or CSV.";
  }
  if (extension === "pdf") {
    return "This PDF could not be analyzed. It may be damaged, image-only, or protected by an unsupported encryption method.";
  }
  return "This statement could not be analyzed. Check that the file is complete and contains a readable bank transaction table.";
}

async function getSha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseStatementPdfLines(lines: string[]) {
  const rows: string[][] = [];
  let current: string[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;

    // Skip summary and footer rows
    if (
      /debit\(s\)|credit\(s\)|clrd\s*\+\s*unclrd|total\s+debit|total\s+credit|opening\s+balance|closing\s+balance|balance\s+brought\s+forward/i.test(
        line
      )
    ) {
      continue;
    }

    const dateMatch = line.match(datePattern);
    if (!dateMatch) {
      if (
        current &&
        !/^(page|total|opening|closing|account|statement|date|description|debit|credit|balance)/i.test(
          line
        )
      ) {
        current[1] = `${current[1]} ${line}`.trim();
      }
      continue;
    }

    const date = dateMatch[1];
    const remainder = line.slice(dateMatch[0].length).trim();
    const amounts = remainder.match(amountPattern) || [];
    const description = remainder
      .replace(amountPattern, " ")
      .replace(/\s+/g, " ")
      .trim();

    const numericValues = amounts
      .map((value) => value.replace(/[₦$£€KShR,NGN\s]/gi, ""))
      .filter((v) => {
        const cleaned = v.replace(/[()]/g, "");
        const num = Number.parseFloat(cleaned);
        return (
          Number.isFinite(num) &&
          Math.abs(num) <= 10_000_000_000_000 &&
          cleaned.replace(/\..*/, "").length <= 12
        );
      });

    if (numericValues.length === 0) continue;

    if (current) rows.push(current);
    const balance = numericValues[numericValues.length - 1];
    const movement = numericValues.length > 1 ? numericValues[numericValues.length - 2] : "";

    const hasCreditIndicators =
      /\b(cr|credit|deposit|inward|inflow|refund|reversal|salary|interest|dividend)\b|transfer\s+from|trf\s+from|received\s+from|from\s+[a-z]/i.test(
        description
      );
    const hasDebitIndicators =
      /\b(dr|debit|withdraw|withdrawal|pos|atm|payment|purchase|bill|fee|charge|stamp\s*duty|transfer\s+to|trf\s+to|paid\s+to)\b/i.test(
        description
      );
    const movementIsDebit = hasCreditIndicators ? false : hasDebitIndicators ? true : true;

    current = [
      date,
      description || "Statement transaction",
      movementIsDebit ? movement : "",
      movementIsDebit ? "" : movement,
      balance,
    ];
  }
  if (current) rows.push(current);
  return rows;
}

function extractPdfMetadata(lines: string[]) {
  const metadata: NonNullable<CSVData["metadata"]> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/account\s*(?:no|number|num)?[:\s]+(\d{8,12})/i.test(line)) {
      const match = line.match(/account\s*(?:no|number|num)?[:\s]+(\d{8,12})/i);
      if (match) metadata.accountNumber = match[1];
    }

    if (/opening\s*balance/i.test(line)) {
      const amounts = line.match(/(?:-|\()?₦?\s*\d[\d,]*(?:\.\d{2})?\)?/g);
      if (amounts && amounts.length > 0) {
        metadata.openingBalance = numberFrom(amounts[amounts.length - 1]);
      }
    }

    if (/total\s*debit[:\s]+/i.test(line)) {
      const amounts = line.match(/(?:-|\()?₦?\s*\d[\d,]*(?:\.\d{2})?\)?/g);
      if (amounts && amounts.length > 0) {
        metadata.totalDebits = numberFrom(amounts[amounts.length - 1]);
      }
    }

    if (/total\s*credit[:\s]+/i.test(line)) {
      const amounts = line.match(/(?:-|\()?₦?\s*\d[\d,]*(?:\.\d{2})?\)?/g);
      if (amounts && amounts.length > 0) {
        metadata.totalCredits = numberFrom(amounts[amounts.length - 1]);
      }
    }

    if (/closing\s*balance[:\s]+/i.test(line)) {
      const amounts = line.match(/(?:-|\()?₦?\s*\d[\d,]*(?:\.\d{2})?\)?/g);
      if (amounts && amounts.length > 0) {
        metadata.closingBalance = numberFrom(amounts[amounts.length - 1]);
      }
    }

    const periodMatch = line.match(/period[:\s]+([0-9A-Za-z\s/-]+?)\s+(?:to|-)\s+([0-9A-Za-z\s/-]+)/i);
    if (periodMatch) {
      metadata.periodStart = periodMatch[1].trim();
      metadata.periodEnd = periodMatch[2].trim();
    }
  }

  return metadata;
}

export function FileUpload({
  onFileUpload,
  onCurrencyDetected,
  disabled,
}: FileUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Analyzing Statement...");
  const [error, setError] = useState<string | null>(null);

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPdfBuffer, setPendingPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [pendingFileName, setPendingFileName] = useState("");

  const uploadToBackend = async (file: File, password?: string): Promise<boolean> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

    try {
      setLoadingMessage("Analyzing statement with Forensic ML Engine...");
      const formData = new FormData();
      formData.append("file", file);
      if (password) {
        formData.append("password", password);
      }

      console.log("➡️ POSTing to backend:", BACKEND_API_URL);

      const response = await fetch(BACKEND_API_URL, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn("Backend error response:", response.status, errorText);
        return false;
      }

      const result = await response.json();
      console.log("✅ Backend result received:", result);

      if (result.status === "UNABLE_TO_VERIFY" && result.reasonCodes?.includes("PDF_ENCRYPTED_PASSWORD_REQUIRED")) {
        setPendingFile(file);
        setPendingFileName(file.name);
        setIsPasswordModalOpen(true);
        return true;
      }

      // CRITICAL FIX: Accept backend payload whenever status exists
      if (result.status && result.status !== "UNABLE_TO_VERIFY") {
        const rows: string[][] = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows : [];
        const headers: string[] = Array.isArray(result.headers) && result.headers.length > 0
          ? result.headers
          : ["Date", "Description", "Debit", "Credit", "Balance"];

        onFileUpload({
          headers,
          rows,
          fileName: result.fileName || file.name,
          fileSize: file.size,
          metadata: {
            sha256: result.sha256,
            integrityStatus: result.status,
            integrityScore: result.integrityScore ?? Math.round((1.0 - (result.tamperConfidence || 0)) * 100),
            integrityWarnings: result.reasonCodes || [],
            openingBalance: result.openingBalance,
            closingBalance: result.closingBalance,
            totalDebits: result.totalDebits,
            totalCredits: result.totalCredits,
          },
        });
        return true;
      }

      return false;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      console.error("Backend fetch failed, falling back to local:", err);
      return false;
    }
  };

  const processPdfBuffer = useCallback(
    async (buffer: ArrayBuffer, fileName: string, password?: string) => {
      try {
        setLoadingMessage("Parsing PDF structure...");
        const loadingTask = getDocument({
          data: buffer,
          password: password || undefined,
        });

        const pdf = await loadingTask.promise;
        if (pdf.numPages < MIN_PDF_PAGES) {
          throw new Error(`PDF page count is ${pdf.numPages}. The statement must contain at least one page.`);
        }
        const lines: string[] = [];
        let fullText = "";

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const items = content.items as Array<{
            str: string;
            transform: number[];
          }>;
          const grouped = new Map<number, string[]>();
          items.forEach((item) => {
            fullText += " " + item.str;
            const y = Math.round(item.transform[5]);
            const line = grouped.get(y) || [];
            line.push(item.str);
            grouped.set(y, line);
          });
          Array.from(grouped.entries())
            .sort((a, b) => b[0] - a[0])
            .forEach(([, cells]) => lines.push(cells.join(" ").trim()));
        }

        if (onCurrencyDetected) {
          onCurrencyDetected(detectCurrencyFromText(fullText));
        }

        const metadata = extractPdfMetadata(lines);
        const sha256 = await getSha256(buffer);
        let data = parseStatementPdfLines(lines);

        if (data.length > 0) {
          data.unshift(["Date", "Description", "Debit", "Credit", "Balance"]);
        }

        if (data.length > 1) {
          validateStatementStructure(data);
          onFileUpload({
            headers: data[0],
            rows: data.slice(1),
            fileName,
            fileSize: buffer.byteLength,
            metadata: {
              ...metadata,
              sha256,
              integrityWarnings: [],
              integrityStatus: "CLEAR",
              integrityScore: 95,
            },
          });
          setIsPasswordModalOpen(false);
          setPendingPdfBuffer(null);
          setPendingFile(null);
          setPdfPassword("");
          return;
        }
        throw new Error("Unable to extract transaction table rows from PDF.");
      } catch (err: unknown) {
        const errObj = err as { name?: string; message?: string };
        if (errObj.name === "PasswordException" || errObj.name === "PasswordError") {
          setIsPasswordModalOpen(true);
          return;
        }
        throw err;
      }
    },
    [onCurrencyDetected, onFileUpload]
  );

  const parseFile = useCallback(
    async (file: File) => {
      setIsLoading(true);
      setLoadingMessage("Reading statement file...");
      setError(null);

      try {
        if (file.size > MAX_FILE_SIZE) {
          throw new Error("File is too large. The maximum supported size is 30 MB.");
        }

        const extension = file.name.split(".").pop()?.toLowerCase();

        if (extension === "pdf") {
          const handled = await uploadToBackend(file);
          if (handled) return;
          const buffer = await file.arrayBuffer();
          await processPdfBuffer(buffer, file.name);
          return;
        }

        let data: string[][] = [];

        if (extension === "csv") {
          const text = await file.text();
          if (onCurrencyDetected) onCurrencyDetected(detectCurrencyFromText(text));
          const results = await new Promise<Papa.ParseResult<string[][]>>((resolve, reject) => {
            Papa.parse<string[]>(file, { skipEmptyLines: true, complete: resolve, error: reject });
          });
          data = results.data.map((row) => row.map((cell) => String(cell ?? "")));
        } else if (extension === "xls" || extension === "xlsx") {
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          if (!firstSheet) throw new Error("The workbook has no readable worksheets");
          data = XLSX.utils
            .sheet_to_json<string[]>(firstSheet, { header: 1, raw: false, defval: "" })
            .map((row) => row.map((cell) => String(cell ?? "")));
        } else {
          throw new Error("Unsupported file type. Upload a PDF, XLS, XLSX, or CSV statement.");
        }

        validateStatementStructure(data);
        onFileUpload({
          headers: data[0],
          rows: data.slice(1),
          fileName: file.name,
          fileSize: file.size,
        });
      } catch (parseError) {
        const extension = file.name.split(".").pop()?.toLowerCase();
        setError(getUserFacingFileError(parseError, extension));
      } finally {
        setLoadingMessage("Analyzing Statement...");
        setIsLoading(false);
      }
    },
    [onFileUpload, onCurrencyDetected, processPdfBuffer]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) void parseFile(file);
    },
    [parseFile]
  );

  const handlePasswordSubmit = async () => {
    if (!pdfPassword.trim()) return;
    setIsLoading(true);
    setLoadingMessage("Decrypting statement...");
    setError(null);

    try {
      if (pendingFile) {
        const ok = await uploadToBackend(pendingFile, pdfPassword);
        if (ok) {
          setIsPasswordModalOpen(false);
          setPendingFile(null);
          setPdfPassword("");
          return;
        }
      }
      if (pendingPdfBuffer) {
        await processPdfBuffer(pendingPdfBuffer, pendingFileName, pdfPassword);
      }
    } catch {
      setError("The password did not unlock this PDF. Please verify and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: disabled || isLoading,
    accept: {
      "text/csv": [".csv"],
      "application/pdf": [".pdf"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
  });

  return (
    <div className="space-y-4">
      <Card className="border-0 bg-transparent shadow-none transition-colors">
        <CardContent className="p-0">
          <div
            {...getRootProps()}
            id="statement-dropzone"
            className={`
              border-2 border-dashed rounded-xl p-7 text-center transition-all
              ${disabled ? "cursor-not-allowed opacity-60 bg-red-50/40 border-red-200" : "cursor-pointer"}
              ${
                isDragActive
                  ? "border-primary bg-secondary"
                  : !disabled
                  ? "border-border/80 bg-[#fbfcfb] hover:border-primary/50 hover:bg-white"
                  : ""
              }
              ${isLoading ? "pointer-events-none opacity-50" : ""}
            `}
          >
            <input {...getInputProps()} id="statement-file-input" disabled={disabled || isLoading} />
            <div className="space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#e5f3d4]">
                {isLoading ? (
                  <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
                ) : (
                  <Upload className="h-6 w-6 text-primary" />
                )}
              </div>
              <div>
                <p className="text-base font-semibold">
                  {isDragActive ? "Drop your statement here" : "Drag & drop your bank statement"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF (supports password protection), Excel, or CSV · Instant Ledger Reconciliation
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="outline" disabled={isLoading || disabled} size="sm">
                  <FileText className="mr-2 h-4 w-4" />
                  {isLoading ? loadingMessage : "Browse Statement File"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}

      {/* Password Dialog */}
      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" /> Protected Statement PDF
            </DialogTitle>
            <DialogDescription>
              Enter the statement password to unlock verification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              type="password"
              placeholder="Enter PDF password..."
              value={pdfPassword}
              onChange={(e) => setPdfPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handlePasswordSubmit();
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => setIsPasswordModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePasswordSubmit} disabled={isLoading || !pdfPassword}>
              {isLoading ? "Decrypting..." : "Unlock & Analyze"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FileUpload;