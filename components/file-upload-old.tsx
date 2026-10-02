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
  Sparkles,
  ShieldAlert,
  KeyRound,
  Plus,
  ScanLine,
} from "lucide-react";
import type { CSVData } from "@/app/page";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { createWorker } from "tesseract.js";
import {
  GlobalWorkerOptions,
  getDocument,
  version as pdfjsVersion,
} from "pdfjs-dist/build/pdf.js";
import { SAMPLE_STATEMENTS } from "@/lib/sample-data";
import { detectCurrencyFromText, SupportedCurrency } from "@/lib/currencies";

GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`;

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
  /(?:NGN|₦|\$|£|€|KSh|R)?\(?-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\)?/g;
const MAX_FILE_SIZE = 30 * 1024 * 1024;
const MIN_PDF_PAGES = 1;

function numberFrom(value: string | undefined): number {
  if (!value) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  if (/[a-zA-Z]/.test(raw)) return 0;
  const isNegative = /^\s*\(.+\)\s*$/.test(raw) || /^\s*-/.test(raw);
  const parsed = Number.parseFloat(raw.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 10_000_000_000_000) return 0;
  return isNegative ? -Math.abs(parsed) : parsed;
}

function validateStatementStructure(data: string[][]) {
  if (data.length < 2 || data[0].length === 0) {
    throw new Error("The statement is empty or has no readable header row.");
  }

  const headers = data[0].map((header) => header.toLowerCase().trim());
  const hasDate = headers.some((header) => /\b(date|time)\b/i.test(header));
  const hasDescription = headers.some((header) =>
    /\b(description|narration|particular|detail|memo|remark)\b/i.test(header)
  );
  const hasBalance = headers.some((header) => /\b(balance|bal)\b/i.test(header));
  const hasAmount = headers.some((header) =>
    /\b(amount|value|debit|credit|deposit|withdrawal|inflow|outflow)\b/i.test(header)
  );

  if (!hasDate || !hasDescription || !hasAmount || !hasBalance) {
    const missingColumns = [
      !hasDate ? "date" : "",
      !hasDescription ? "description" : "",
      !hasAmount ? "transaction amount or debit/credit" : "",
      !hasBalance ? "balance" : "",
    ].filter(Boolean);
    throw new Error(
      `Statement structure is not supported. Missing required column(s): ${missingColumns.join(
        ", "
      )}.`
    );
  }

  const transactionRows = data.slice(1).filter((row) => row.some((cell) => String(cell).trim()));
  if (transactionRows.length === 0) {
    throw new Error("The statement contains no transaction rows.");
  }

  const numericColumnIndexes = headers.reduce<number[]>((indexes, header, index) => {
    if (/\b(amount|value|debit|credit|deposit|withdrawal|inflow|outflow|balance|bal)\b/i.test(header)) {
      indexes.push(index);
    }
    return indexes;
  }, []);
  const numericValues = transactionRows.flatMap((row) =>
    numericColumnIndexes.map((index) => String(row[index] ?? "").trim()).filter(Boolean)
  );
  const numericValueCount = numericValues.filter((value) => numberFrom(value) !== 0).length;
  if (numericValues.length === 0 || numericValueCount === 0) {
    throw new Error("The statement has no readable numeric transaction or balance values.");
  }
}

function getUserFacingFileError(error: unknown, extension?: string) {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Statement structure is not supported")) return message;
  if (message.includes("no transaction rows")) {
    return "No transactions were found. Upload a statement that contains transaction rows.";
  }
  if (message.includes("no readable numeric")) {
    return "The transaction amounts or balances could not be read. Check that the statement is not an image-only scan and that its values are numeric.";
  }
  if (message.includes("PDF page count")) return message;
  if (message.includes("password-protected")) return message;
  if (message.includes("CSV parsing error")) {
    return "This CSV could not be read because its rows are malformed. Export it again as a standard comma-separated CSV file.";
  }
  if (message.includes("no readable worksheets")) {
    return "This spreadsheet has no readable worksheet. Open it in Excel and export the statement again as XLSX or CSV.";
  }
  if (message.includes("Unable to extract transaction table")) {
    return "No readable transaction table was found in this PDF. Upload a text-based bank statement rather than an image-only scan.";
  }
  if (extension === "pdf") {
    return "This PDF could not be analyzed. It may be damaged, image-only, or protected by an unsupported encryption method.";
  }
  if (extension === "xls" || extension === "xlsx") {
    return "This spreadsheet could not be analyzed. Check that it opens correctly and contains the bank transaction table on a worksheet.";
  }
  return "This statement could not be analyzed. Check that the file is complete and contains a readable bank transaction table.";
}

function getPdfIntegrityWarnings(
  info: Record<string, unknown> | undefined,
  annotations: Array<{ subtype?: string; fieldType?: string }>,
  textItemCount: number,
  overlappingTextItems: number
) {
  const warnings: string[] = [];
  const editableFields = annotations.filter((annotation) => annotation.subtype === "Widget");
  const editableMarkup = annotations.filter((annotation) =>
    ["FreeText", "Ink", "Square", "Highlight", "Underline", "StrikeOut"].includes(
      annotation.subtype || ""
    )
  );

  if (editableFields.length > 0) {
    warnings.push(`${editableFields.length} editable PDF form field(s) detected`);
  }
  if (editableMarkup.length > 0) {
    warnings.push(`${editableMarkup.length} PDF markup/overlay annotation(s) detected`);
  }

  const creationDate = info?.CreationDate;
  const modificationDate = info?.ModDate;
  if (typeof creationDate === "string" && typeof modificationDate === "string") {
    const created = Date.parse(creationDate.replace(/^D:/, ""));
    const modified = Date.parse(modificationDate.replace(/^D:/, ""));
    if (Number.isFinite(created) && Number.isFinite(modified) && modified - created > 60_000) {
      warnings.push("PDF modification time is later than its creation time");
    }
  }

  const producer = typeof info?.Producer === "string" ? info.Producer : "";
  if (/photoshop|illustrator|acrobat|foxit|nitro|editor|libreoffice/i.test(producer)) {
    warnings.push(`PDF producer indicates an editing application (${producer})`);
  }
  if (textItemCount === 0) {
    warnings.push("PDF has no searchable text layer; values require OCR verification");
  }
  if (overlappingTextItems > 0) {
    warnings.push(`${overlappingTextItems} overlapping text layer position(s) detected`);
  }

  return warnings;
}

function getIntegrityAssessment(warnings: string[]) {
  const reviewOnlyWarnings = warnings.filter((warning) =>
    /no searchable text layer|editing application/i.test(warning)
  );
  const tamperSignals = warnings.filter((warning) => !reviewOnlyWarnings.includes(warning));
  const integrityScore = Math.max(0, 100 - tamperSignals.length * 30 - reviewOnlyWarnings.length * 10);
  const integrityStatus =
    tamperSignals.length > 0
      ? "POSSIBLE_TAMPERING"
      : reviewOnlyWarnings.length > 0
      ? "REVIEW"
      : "CLEAR";
  return { integrityStatus, integrityScore, reviewOnlyWarnings, tamperSignals } as const;
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
    // Filter out long integers (e.g. 15-30 digit session IDs or account numbers) from amount candidates
    const numericValues = amounts
      .map((value) => value.replace(/[₦$£€KShR,NGN\s]/gi, ""))
      .filter((v) => {
        const cleaned = v.replace(/[()]/g, "");
        const num = Number.parseFloat(cleaned);
        return Number.isFinite(num) && Math.abs(num) <= 10_000_000_000_000 && cleaned.replace(/\..*/, "").length <= 12;
      });

    if (numericValues.length === 0) continue;

    if (current) rows.push(current);
    const balance = numericValues[numericValues.length - 1];
    const movement =
      numericValues.length > 1 ? numericValues[numericValues.length - 2] : "";

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
  const periodLine = lines.find(
    (line) => /account statement/i.test(line) && /\bto\b/i.test(line)
  );
  const periodMatch = periodLine?.match(/statement:\s*(.+?)\s+to\s+(.+)$/i);
  if (periodMatch) {
    metadata.periodStart = periodMatch[1].trim();
    metadata.periodEnd = periodMatch[2].trim();
  }
  const holderLine = lines.find((line) =>
    /^[A-Z][A-Z .'-]{4,}$/.test(line.trim())
  );
  if (holderLine) metadata.accountHolder = holderLine.trim();
  const openingLine = lines.find((line) =>
    /opening balance|balance brought forward|brought forward|balance\s*(b\/f|bf)/i.test(
      line
    )
  );
  const openingAmounts = openingLine?.match(amountPattern);
  const openingAmount =
    openingAmounts && openingAmounts.length > 0
      ? openingAmounts[openingAmounts.length - 1]
      : undefined;
  if (openingAmount) metadata.openingBalance = numberFrom(openingAmount);
  const accountTypeLine = lines.find((line) => /account type/i.test(line));
  if (accountTypeLine)
    metadata.accountType = accountTypeLine
      .replace(/account type:?/i, "")
      .trim();

  // Extract Account Number (NUBAN or standard 10-digit number)
  const accNumLine = lines.find((line) =>
    /account\s*(?:no|num|number)?[:\s]+(\d{8,12})/i.test(line)
  );
  const accNumMatch = accNumLine?.match(/account\s*(?:no|num|number)?[:\s]+(\d{8,12})/i);
  if (accNumMatch) {
    metadata.accountNumber = accNumMatch[1].trim();
  } else {
    // Look for any isolated 10-digit number near the top 30 lines
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const m = lines[i].match(/\b([01289]\d{9})\b/);
      if (m && !/date|time|ref|tel/i.test(lines[i])) {
        metadata.accountNumber = m[1];
        break;
      }
    }
  }

  return metadata;
}

export function FileUpload({
  onFileUpload,
  onAppendStatement,
  onCurrencyDetected,
  fileNumber,
  hasExistingStatement,
  disabled,
}: FileUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Analyzing Statement...");
  const [error, setError] = useState<string | null>(null);
  const [tamperWarning, setTamperWarning] = useState<string | null>(null);

  // PDF password states
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pdfPassword, setPdfPassword] = useState("");
  const [pendingPdfBuffer, setPendingPdfBuffer] = useState<ArrayBuffer | null>(
    null
  );
  const [pendingFileName, setPendingFileName] = useState("");
  const [pendingPdfPassword, setPendingPdfPassword] = useState<string | undefined>();
  const [isScanConsentOpen, setIsScanConsentOpen] = useState(false);

  const processPdfBuffer = useCallback(
    async (
      buffer: ArrayBuffer,
      fileName: string,
      password?: string,
      allowOcr = false
    ) => {
      try {
        const loadingTask = getDocument({
          data: buffer,
          password: password || undefined,
          ...(password
            ? {
                onPassword: (updatePassword: (value: string) => void) => {
                  updatePassword(password);
                },
              }
            : {}),
        });

        const pdf = await loadingTask.promise;
        if (pdf.numPages < MIN_PDF_PAGES) {
          throw new Error(
            `PDF page count is ${pdf.numPages}. The statement must contain at least one page.`
          );
        }
        const lines: string[] = [];
        let fullText = "";
        let textItemCount = 0;
        let overlappingTextItems = 0;
        const annotations: Array<{ subtype?: string; fieldType?: string }> = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          annotations.push(...(await page.getAnnotations()));
          const content = await page.getTextContent();
          const items = content.items as Array<{
            str: string;
            transform: number[];
            width?: number;
            height?: number;
          }>;
          textItemCount += items.length;
          const positions = new Map<string, string>();
          const grouped = new Map<number, string[]>();
          items.forEach((item) => {
            fullText += " " + item.str;
            const positionKey = `${Math.round(item.transform[4])}:${Math.round(item.transform[5])}`;
            const previousText = positions.get(positionKey);
            if (previousText && previousText !== item.str.trim()) {
              overlappingTextItems += 1;
            }
            if (item.str.trim()) positions.set(positionKey, item.str.trim());
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
        const pdfMetadata = await pdf.getMetadata();
        const sha256 = await getSha256(buffer);
        const integrityWarnings = getPdfIntegrityWarnings(
          pdfMetadata.info as Record<string, unknown> | undefined,
          annotations,
          textItemCount,
          overlappingTextItems
        );
        const integrityAssessment = getIntegrityAssessment(integrityWarnings);
        let data = parseStatementPdfLines(lines);

        // Scanned statements have no embedded text. OCR them only after the fast text path fails.
        if (data.length === 0 && textItemCount < 50 && !allowOcr) {
          setPendingPdfBuffer(buffer);
          setPendingFileName(fileName);
          setPendingPdfPassword(password);
          setIsScanConsentOpen(true);
          setError("This PDF appears to be scanned or image-based.");
          return;
        }

        if (data.length === 0 && textItemCount < 50 && allowOcr) {
          setLoadingMessage(`Scanned PDF detected. Reading ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"} with OCR...`);
          const worker = await createWorker("eng");
          try {
            const ocrLines: string[] = [];
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
              const page = await pdf.getPage(pageNumber);
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.createElement("canvas");
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const context = canvas.getContext("2d");
              if (!context) continue;
              await page.render({ canvasContext: context, viewport }).promise;
              const result = await worker.recognize(canvas);
              ocrLines.push(...result.data.text.split(/\r?\n/));
              canvas.width = 0;
              canvas.height = 0;
            }
            data = parseStatementPdfLines(ocrLines);
            if (onCurrencyDetected) {
              onCurrencyDetected(detectCurrencyFromText(ocrLines.join(" ")));
            }
          } finally {
            await worker.terminate();
          }
        }
        if (data.length > 0)
          data.unshift(["Date", "Description", "Debit", "Credit", "Balance"]);

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
              integrityWarnings,
              integrityStatus: integrityAssessment.integrityStatus,
              integrityScore: integrityAssessment.integrityScore,
            },
          });
          if (integrityAssessment.tamperSignals.length > 0) {
            setTamperWarning(
              `Possible document tampering detected: ${integrityAssessment.tamperSignals.join(", ")}. The report should not be treated as verified until this statement is checked against the original bank-issued document.`
            );
          }
          setIsPasswordModalOpen(false);
          setPendingPdfBuffer(null);
          setPendingPdfPassword(undefined);
          setPdfPassword("");
          return;
        }
        throw new Error("Unable to extract transaction table rows from PDF.");
      } catch (err: unknown) {
        const errObj = err as { name?: string; message?: string };
        if (
          errObj.name === "PasswordException" ||
          errObj.name === "PasswordError"
        ) {
          setPendingPdfBuffer(null);
          setPendingFileName("");
          setPendingPdfPassword(undefined);
          setIsPasswordModalOpen(false);
          setError(
            "This PDF is password-protected and cannot be analyzed here. Unlock it in your PDF viewer, export or print an unprotected copy, then upload that copy."
          );
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
        let data: string[][] = [];

        if (extension === "csv") {
          const text = await file.text();
          if (onCurrencyDetected) {
            onCurrencyDetected(detectCurrencyFromText(text));
          }
          const results = await new Promise<any>((resolve, reject) => {
            Papa.parse(file, {
              skipEmptyLines: true,
              complete: resolve,
              error: reject,
            });
          });
          if (results.errors.length > 0)
            throw new Error(`CSV parsing error: ${results.errors[0].message}`);
          data = results.data.map((row: string[]) =>
            row.map((cell: string) => String(cell ?? ""))
          );
        } else if (extension === "xls" || extension === "xlsx") {
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, {
            type: "array",
            cellDates: true,
          });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          if (!firstSheet)
            throw new Error("The workbook has no readable worksheets");
          data = XLSX.utils
            .sheet_to_json<string[]>(firstSheet, {
              header: 1,
              raw: false,
              defval: "",
            })
            .map((row: string[]) => row.map((cell: string) => String(cell ?? "")));
        } else if (extension === "pdf") {
          const buffer = await file.arrayBuffer();
          await processPdfBuffer(buffer, file.name);
          return;
        } else {
          throw new Error(
            "Unsupported file type. Upload a PDF, XLS, XLSX, or CSV statement."
          );
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
      if (file) {
        void parseFile(file);
      }
    },
    [parseFile]
  );

  const handlePasswordSubmit = async () => {
    if (!pendingPdfBuffer) return;
    if (!pdfPassword.trim()) {
      setError("Enter the statement password to continue.");
      return;
    }
    setIsLoading(true);
    setLoadingMessage("Decrypting protected PDF...");
    setError(null);
    try {
      await processPdfBuffer(pendingPdfBuffer, pendingFileName, pdfPassword);
    } catch (err: unknown) {
      setError("The password did not unlock this PDF. Check the password and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleScanConsent = async (accepted: boolean) => {
    if (!accepted) {
      setIsScanConsentOpen(false);
      setPendingPdfBuffer(null);
      setPendingFileName("");
      setPendingPdfPassword(undefined);
      setError("Analysis cancelled. This scanned PDF was not processed.");
      return;
    }
    if (!pendingPdfBuffer) return;
    setIsScanConsentOpen(false);
    setIsLoading(true);
    setLoadingMessage("Reading scanned statement with OCR...");
    setError(null);
    try {
      await processPdfBuffer(pendingPdfBuffer, pendingFileName, pendingPdfPassword, true);
    } catch (err: unknown) {
      const extension = pendingFileName.split(".").pop()?.toLowerCase();
      setError(getUserFacingFileError(err, extension));
    } finally {
      setLoadingMessage("Analyzing Statement...");
      setIsLoading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected: (fileRejections) => {
      const rejection = fileRejections[0];
      if (rejection?.errors.some((item) => item.code === "file-too-large")) {
        setError("File is too large. The maximum supported size is 30 MB.");
      } else {
        setError("Unsupported file. Upload one PDF, XLS, XLSX, or CSV statement.");
      }
    },
    disabled: disabled || isLoading,
    accept: {
      "text/csv": [".csv"],
      "application/pdf": [".pdf"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
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
              {disabled ? (
                <div>
                  <p className="text-base font-semibold text-red-700 flex items-center justify-center gap-1.5">
                    <ShieldAlert className="w-5 h-5 text-red-600" />
                    Account Suspended — Upload Disabled
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your account has been suspended by an administrator. Please reach out to reactivate privileges.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-base font-semibold">
                    {isDragActive
                      ? "Drop your statement here"
                      : "Drag & drop your bank statement"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF (supports password protection), Excel, or CSV · Instant in-browser analysis
                  </p>
                </div>
              )}
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

      {/* Quick Load Realistic Statements for instant testing / demo */}
      {/* <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-border/80 bg-[#fbfcfb] p-3 text-xs">
        <span className="font-semibold text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Or test with sample data:
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            id="load-prime-sample-btn"
            type="button"
            variant="outline"
            disabled={disabled || isLoading}
            size="sm"
            className="h-8 text-xs font-medium hover:bg-[#e5f3d4] hover:text-[#183238]"
            onClick={() => onFileUpload(SAMPLE_STATEMENTS.prime)}
          >
            <ShieldAlert className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
            Prime Borrower (3-Mo Healthy Cashflow)
          </Button>
          <Button
            id="load-flagged-sample-btn"
            type="button"
            variant="outline"
            disabled={disabled || isLoading}
            size="sm"
            className="h-8 text-xs font-medium hover:bg-rose-50 hover:text-rose-900"
            onClick={() => onFileUpload(SAMPLE_STATEMENTS.flagged)}
          >
            <AlertCircle className="mr-1.5 h-3.5 w-3.5 text-rose-600" />
            Tampered Ledger (Math Break & Bets)
          </Button>
          <Button
            id="load-circular-sample-btn"
            type="button"
            variant="outline"
            disabled={disabled || isLoading}
            size="sm"
            className="h-8 text-xs font-medium hover:bg-amber-50 hover:text-amber-900"
            onClick={() => onFileUpload(SAMPLE_STATEMENTS.circular_wash)}
          >
            <AlertCircle className="mr-1.5 h-3.5 w-3.5 text-amber-600" />
            Circular Mule & Wash Fraud (Artificial Turnover)
          </Button>
        </div>
      </div> */}

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}

      <Dialog open={isScanConsentOpen} onOpenChange={setIsScanConsentOpen}>
        <DialogContent id="scanned-pdf-consent-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" /> Scanned PDF detected
            </DialogTitle>
            <DialogDescription>
              This statement does not contain selectable text. The analyzer can use OCR to read the pages, but OCR may be slower and can make mistakes with dates or amounts. Do you want to continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => void handleScanConsent(false)}>
              Decline
            </Button>
            <Button id="accept-scanned-pdf-btn" onClick={() => void handleScanConsent(true)}>
              Accept &amp; Analyze with OCR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(tamperWarning)}
        onOpenChange={(open) => {
          if (!open) setTamperWarning(null);
        }}
      >
        <DialogContent id="possible-tampering-dialog" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-800">
              <ShieldAlert className="h-5 w-5 text-rose-600" /> Possible doctored statement detected
            </DialogTitle>
            <DialogDescription className="pt-2 text-rose-900/80">
              {tamperWarning}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            This is a forensic warning, not proof of fraud. Do not approve a loan or rely on this report until the original statement is verified with the bank.
          </div>
          <DialogFooter>
            <Button
              id="acknowledge-tampering-warning-btn"
              variant="destructive"
              onClick={() => setTamperWarning(null)}
            >
              I Understand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Protected PDF Decryption Dialog */}
      <Dialog
        open={isPasswordModalOpen}
        onOpenChange={(open) => {
          setIsPasswordModalOpen(open);
          if (!open && !isLoading) {
            setPendingPdfBuffer(null);
            setPendingFileName("");
            setPendingPdfPassword(undefined);
            setPdfPassword("");
          }
        }}
      >
        <DialogContent id="pdf-password-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" /> Protected Statement PDF
            </DialogTitle>
            <DialogDescription>
              This bank statement is encrypted. Most retail banks set passwords to your account number, birthdate (e.g. DDMMYYYY), or last 4 digits of your phone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-xs font-medium text-foreground">
              Statement Decryption Password
            </label>
            <Input
              id="pdf-password-input"
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
            <Button
              variant="ghost"
              onClick={() => {
                setIsPasswordModalOpen(false);
                setPendingPdfBuffer(null);
                setPendingFileName("");
                setPendingPdfPassword(undefined);
                setPdfPassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              id="submit-pdf-password-btn"
              onClick={handlePasswordSubmit}
              disabled={isLoading || !pdfPassword}
            >
              {isLoading ? "Decrypting..." : "Unlock & Analyze"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
