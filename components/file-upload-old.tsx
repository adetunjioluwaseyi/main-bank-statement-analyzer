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
  onFileError?: (fileName: string, message: string) => void;
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
const positionedAmountCellPattern =
  /^(?:--|(?:NGN|₦|\$|£|€|KSh|R)?\s*\(?-?\d[\d,.]*\.\d{1,2}\)?)$/i;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MIN_PDF_PAGES = 1;
const BACKEND_ANALYSIS_TIMEOUT_MS = 120_000;

type PositionedPdfLine = {
  pageNumber: number;
  y: number;
  items: Array<{ x: number; text: string }>;
  3
};

function numberFrom(value: string | undefined): number {
  if (!value) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\b(?:NGN|USD|GBP|EUR|KES|ZAR|KSH|GHS|CR|DR)\b/gi, "");
  if (/[a-zA-Z]/.test(normalized)) return 0;
  const isNegative = /^\s*\(.+\)\s*$/.test(raw) || /^\s*-/.test(raw);
  const parsed = Number.parseFloat(normalized.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 10_000_000_000_000) return 0;
  return isNegative ? -Math.abs(parsed) : parsed;
}

type BackendMetadata = Pick<
  NonNullable<CSVData["metadata"]>,
  | "sha256"
  | "integrityStatus"
  | "integrityScore"
  | "integrityWarnings"
  | "openingBalance"
  | "closingBalance"
  | "totalDebits"
  | "totalCredits"
>;

type BackendUploadResult = {
  handled: boolean;
  metadata?: BackendMetadata;
};

function hasUsableBackendTransactions(headers: string[], rows: string[][]): boolean {
  const normalizedHeaders = headers.map((header) => header.toLowerCase().trim());
  const debitIndex = normalizedHeaders.findIndex((header) =>
    /^(debit|dr\.?|withdrawal|outflow|paid_?out)$/i.test(header) ||
    /\b(debit|dr|withdrawal|outflow)\b/i.test(header)
  );
  const creditIndex = normalizedHeaders.findIndex((header) =>
    /^(credit|cr\.?|deposit|inflow|paid_?in)$/i.test(header) ||
    /\b(credit|cr|deposit|inflow)\b/i.test(header)
  );
  const amountIndex = normalizedHeaders.findIndex((header) =>
    /^(amount|value|transaction_?amount)$/i.test(header)
  );
  const transactionAmountIndexes = [debitIndex, creditIndex]
    .filter((index) => index >= 0);

  if (transactionAmountIndexes.length === 0 && amountIndex >= 0) {
    transactionAmountIndexes.push(amountIndex);
  }
  if (transactionAmountIndexes.length === 0) return false;

  return rows.some((row) =>
    transactionAmountIndexes.some((index) => numberFrom(row[index]) !== 0)
  );
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

function parsePositionedWalletStatement(
  lines: PositionedPdfLine[],
  fullText: string
): string[][] | null {
  if (
    !/\bwallet\s+account\b/i.test(fullText) ||
    !/\btrans\.\s*time\b/i.test(fullText) ||
    !/\bdebit\b/i.test(fullText) ||
    !/\bcredit\b/i.test(fullText) ||
    !/\bbalance\s+after\b/i.test(fullText)
  ) {
    return null;
  }

  const rows: string[][] = [];
  const dateLines = lines.flatMap((line) => {
    const dateText = line.items
      .filter((item) => item.x < 130)
      .map((item) => item.text)
      .join(" ");
    const dateMatch = dateText.match(datePattern);
    return dateMatch ? [{ line, date: dateMatch[0] }] : [];
  });
  const dateLinesByPage = new Map<number, typeof dateLines>();
  for (const dateLine of dateLines) {
    const pageDateLines = dateLinesByPage.get(dateLine.line.pageNumber) ?? [];
    pageDateLines.push(dateLine);
    dateLinesByPage.set(dateLine.line.pageNumber, pageDateLines);
  }
  const amountCellsByDateLine = new Map<
    PositionedPdfLine,
    Array<{ x: number; text: string }>
  >();
  for (const candidate of lines) {
    const pageDateLines = dateLinesByPage.get(candidate.pageNumber) ?? [];
    for (const item of candidate.items) {
      if (item.x < 240 || !positionedAmountCellPattern.test(item.text.trim())) {
        continue;
      }
      const nearestDateLine = pageDateLines.reduce<
        (typeof dateLines)[number] | null
      >((nearest, current) => {
        if (!nearest) return current;
        return Math.abs(candidate.y - current.line.y) <
          Math.abs(candidate.y - nearest.line.y)
          ? current
          : nearest;
      }, null);
      if (
        nearestDateLine &&
        Math.abs(candidate.y - nearestDateLine.line.y) <= 9
      ) {
        const cells = amountCellsByDateLine.get(nearestDateLine.line) ?? [];
        cells.push(item);
        amountCellsByDateLine.set(nearestDateLine.line, cells);
      }
    }
  }

  for (const { line, date } of dateLines) {
    const amountCells = (amountCellsByDateLine.get(line) ?? [])
      .sort((a, b) => a.x - b.x)
      .slice(0, 3);
    if (amountCells.length < 2) continue;

    const description = lines
      .filter(
        (candidate) =>
          candidate.pageNumber === line.pageNumber &&
          Math.abs(candidate.y - line.y) <= 9
      )
      .flatMap((candidate) =>
        candidate.items
          .filter(
            (item) =>
              item.x >= 170 && item.x < amountCells[0].x - 2
          )
          .map((item) => ({ y: candidate.y, x: item.x, text: item.text }))
      )
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((item) => item.text)
      .join(" ");
    const values = amountCells.map((cell) =>
      cell.text.trim() === "--" ? "" : cell.text.trim()
    );
    values.push(...Array.from({ length: 3 - values.length }, () => ""));
    rows.push([date, description, values[0], values[1], values[2]]);
  }

  return rows.length > 0 ? rows : null;
}

function parsePositionedMoniepointStatement(
  lines: PositionedPdfLine[],
  fullText: string
): string[][] | null {
  if (
    !/\baccount\s+summary\b/i.test(fullText) ||
    !/\bnarration\b/i.test(fullText) ||
    !/\breference\b/i.test(fullText)
  ) {
    return null;
  }

  const headerLine = lines.find((line) => {
    if (line.pageNumber !== 1) return false;
    const labels = new Set(line.items.map((item) => item.text.trim().toLowerCase()));
    return ["date", "narration", "reference", "debit", "credit", "balance"].every(
      (label) => labels.has(label)
    );
  });
  if (!headerLine) return null;

  const headerPositions = new Map(
    headerLine.items.map((item) => [item.text.trim().toLowerCase(), item.x])
  );
  const dateX = headerPositions.get("date");
  const narrationX = headerPositions.get("narration");
  const referenceX = headerPositions.get("reference");
  const debitX = headerPositions.get("debit");
  const creditX = headerPositions.get("credit");
  const balanceX = headerPositions.get("balance");
  if (
    dateX === undefined ||
    narrationX === undefined ||
    referenceX === undefined ||
    debitX === undefined ||
    creditX === undefined ||
    balanceX === undefined
  ) {
    return null;
  }

  const datePrefixPattern = /^20\d{2}-\d{2}-\d{2}T\d{2}:$/;
  const timeFragmentPattern = /^(?:\d{2}:\d{2}|\d{2})$/;
  const dateLines = lines.flatMap((line) => {
    if (line.pageNumber === 1 && line === headerLine) return [];
    const datePrefix = line.items.find(
      (item) => item.x < dateX + 70 && datePrefixPattern.test(item.text.trim())
    );
    return datePrefix
      ? [{ line, datePrefix: datePrefix.text.trim() }]
      : [];
  });
  const dateLinesByPage = new Map<number, typeof dateLines>();
  for (const dateLine of dateLines) {
    const pageDateLines = dateLinesByPage.get(dateLine.line.pageNumber) ?? [];
    pageDateLines.push(dateLine);
    dateLinesByPage.set(dateLine.line.pageNumber, pageDateLines);
  }
  const transactionValues = new Map<
    PositionedPdfLine,
    Map<"debit" | "credit" | "balance", string>
  >();
  const amountColumns = [
    ["debit", debitX],
    ["credit", creditX],
    ["balance", balanceX],
  ] as const;

  for (const candidate of lines) {
    const pageDateLines = dateLinesByPage.get(candidate.pageNumber) ?? [];
    for (const item of candidate.items) {
      const rawValue = item.text.trim();
      if (item.x < referenceX || !positionedAmountCellPattern.test(rawValue)) continue;

      const nearestColumn = amountColumns.reduce<(typeof amountColumns)[number] | null>(
        (nearest, current) =>
          !nearest || Math.abs(item.x - current[1]) < Math.abs(item.x - nearest[1])
            ? current
            : nearest,
        null
      );
      if (!nearestColumn || Math.abs(item.x - nearestColumn[1]) > 40) continue;

      const nearestDateLine = pageDateLines.reduce<
        (typeof dateLines)[number] | null
      >(
        (nearest, current) =>
          !nearest || Math.abs(candidate.y - current.line.y) <
            Math.abs(candidate.y - nearest.line.y)
            ? current
            : nearest,
        null
      );
      if (!nearestDateLine || Math.abs(candidate.y - nearestDateLine.line.y) > 20) {
        continue;
      }

      let value = rawValue.replace(/^(?:NGN|₦)\s*/i, "");
      const malformedGrouping = value.match(
        /^(-?)(\d{1,3})\.(\d{3},\d{3}\.\d{2})$/
      );
      if (malformedGrouping) {
        value = `${malformedGrouping[1]}${malformedGrouping[2]},${malformedGrouping[3]}`;
      }
      const values = transactionValues.get(nearestDateLine.line) ?? new Map();
      values.set(nearestColumn[0], value === "--" ? "" : value);
      transactionValues.set(nearestDateLine.line, values);
    }
  }

  const rows = dateLines.map(({ line, datePrefix }) => {
    const nearbyLines = lines.filter(
      (candidate) =>
        candidate.pageNumber === line.pageNumber &&
        Math.abs(candidate.y - line.y) <= 24
    );
    const timeFragment = nearbyLines
      .flatMap((candidate) =>
        candidate.items
          .filter(
            (item) =>
              item.x < dateX + 70 && timeFragmentPattern.test(item.text.trim())
          )
          .map((item) => ({ y: candidate.y, text: item.text.trim() }))
      )
      .sort(
        (a, b) =>
          Math.abs(a.y - line.y) - Math.abs(b.y - line.y)
      )[0]?.text;
    const date = timeFragment
      ? `${datePrefix}${timeFragment}`
      : datePrefix.slice(0, 10);
    const description = nearbyLines
      .flatMap((candidate) =>
        candidate.items
          .filter((item) => item.x >= narrationX && item.x < referenceX)
          .map((item) => item.text)
      )
      .join(" ");
    const values = transactionValues.get(line);
    return [
      date,
      description,
      values?.get("debit") ?? "",
      values?.get("credit") ?? "",
      values?.get("balance") ?? "",
    ];
  });

  return rows.length > 0 ? rows : null;
}

function extractPdfMetadata(lines: string[]) {
  const metadata: NonNullable<CSVData["metadata"]> = {};
  const amountPattern = /(?:NGN|USD|GBP|EUR|KES|ZAR|KSH|GHS|₦|\$|£|€)?\s*\(?-?\s*(?:NGN|USD|GBP|EUR|KES|ZAR|KSH|GHS|₦|\$|£|€)?\s*\d[\d,]*(?:\.\d{1,2})?\)?/i;
  const summaryLabels = [
    { key: "openingBalance", label: /\b(?:opening\s+balance|balance\s+brought\s+forward|brought\s+forward\s+balance)\b/i },
    { key: "closingBalance", label: /\bclosing\s+balance\b/i },
    { key: "totalDebits", label: /\btotal\s+(?:debits?|debit\(s\)|withdrawals?|outflow)\b/i },
    { key: "totalCredits", label: /\btotal\s+(?:credits?|credit\(s\)|deposits?|inflow)\b/i },
  ] as const;
  const summaryText = lines.join("\n");

  for (const { key, label } of summaryLabels) {
    if (key === "openingBalance") {
      const interleaved = new RegExp(
        `\\bopening\\s+(${amountPattern.source})\\s+balance\\b`,
        "i"
      ).exec(summaryText);
      if (interleaved) {
        metadata[key] = numberFrom(interleaved[1]);
        continue;
      }
    }

    const match = new RegExp(
      `${label.source}[^0-9]{0,100}(${amountPattern.source})`,
      "i"
    ).exec(summaryText);
    if (match) metadata[key] = numberFrom(match[1]);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/account\s*(?:no|number|num)?[:\s]+(\d{8,12})/i.test(line)) {
      const match = line.match(/account\s*(?:no|number|num)?[:\s]+(\d{8,12})/i);
      if (match) metadata.accountNumber = match[1];
    }

    const dateRange = line.match(
      /(?<!\d)(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\s*(?:-|to|–|—)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})(?!\d)/i
    );
    if (dateRange && /\bdate\b/i.test(line)) {
      metadata.periodStart = dateRange[1];
      metadata.periodEnd = dateRange[2];
    }
  }

  if (!metadata.periodStart) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\s*date\s*$/i.test(lines[index])) continue;
      const dateRange = lines.slice(index + 1, index + 4).join(" ").match(
        /(?<!\d)(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\s*(?:-|to|–|—)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})(?!\d)/i
      );
      if (dateRange) {
        metadata.periodStart = dateRange[1];
        metadata.periodEnd = dateRange[2];
      }
      break;
    }
  }

  return metadata;
}

async function extractFirstPagePdfMetadata(
  buffer: ArrayBuffer,
  password?: string
): Promise<NonNullable<CSVData["metadata"]>> {
  const loadingTask = getDocument({ data: buffer, password: password || undefined });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const items = content.items as Array<{ str: string; transform: number[] }>;
  const grouped = new Map<number, string[]>();

  items.forEach((item) => {
    const y = Math.round(item.transform[5]);
    const line = grouped.get(y) || [];
    line.push(item.str);
    grouped.set(y, line);
  });

  const lines = Array.from(grouped.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, cells]) => cells.join(" ").trim());

  return extractPdfMetadata(lines);
}

export function FileUpload({
  onFileUpload,
  onFileError,
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

  const uploadToBackend = useCallback(async (file: File, password?: string): Promise<BackendUploadResult> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      BACKEND_ANALYSIS_TIMEOUT_MS
    );

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

      if (!response.ok) {
        const errorText = await response.text();
        console.warn("Backend error response:", response.status, errorText);
        return { handled: false };
      }

      const result = await response.json() as {
        status?: string;
        reasonCodes?: string[];
        rows?: unknown;
        headers?: unknown;
        fileName?: string;
        sha256?: string;
        integrityScore?: number;
        tamperConfidence?: number;
        openingBalance?: number;
        closingBalance?: number;
        totalDebits?: number;
        totalCredits?: number;
      };
      console.log("✅ Backend result received:", result);

      if (result.status === "UNABLE_TO_VERIFY" && result.reasonCodes?.includes("PDF_ENCRYPTED_PASSWORD_REQUIRED")) {
        setPendingFile(file);
        setPendingFileName(file.name);
        setIsPasswordModalOpen(true);
        return { handled: true };
      }

      if (result.status && result.status !== "UNABLE_TO_VERIFY") {
        const backendMetadata: BackendMetadata = {
          sha256: result.sha256,
          integrityStatus: result.status,
          integrityScore: result.integrityScore ?? Math.round((1.0 - (result.tamperConfidence || 0)) * 100),
          integrityWarnings: result.reasonCodes || [],
          openingBalance: result.openingBalance,
          closingBalance: result.closingBalance,
          totalDebits: result.totalDebits,
          totalCredits: result.totalCredits,
        };
        const rows = Array.isArray(result.rows)
          ? result.rows.filter((row): row is string[] =>
              Array.isArray(row) && row.every((cell) => typeof cell === "string")
            )
          : [];
        const headers = Array.isArray(result.headers)
          ? result.headers.filter((header): header is string => typeof header === "string")
          : [];

        if (!hasUsableBackendTransactions(headers, rows)) {
          return { handled: false, metadata: backendMetadata };
        }

        let browserMetadata: NonNullable<CSVData["metadata"]> = {};
        try {
          setLoadingMessage("Reading statement summary...");
          browserMetadata = await extractFirstPagePdfMetadata(await file.arrayBuffer(), password);
        } catch (metadataError) {
          console.warn("Could not extract PDF summary in the browser:", metadataError);
        }

        onFileUpload({
          headers,
          rows,
          fileName: result.fileName || file.name,
          fileSize: file.size,
          metadata: {
            ...browserMetadata,
            ...backendMetadata,
            openingBalance: backendMetadata.openingBalance ?? browserMetadata.openingBalance,
            closingBalance: backendMetadata.closingBalance ?? browserMetadata.closingBalance,
            totalDebits: backendMetadata.totalDebits ?? browserMetadata.totalDebits,
            totalCredits: backendMetadata.totalCredits ?? browserMetadata.totalCredits,
            sha256: backendMetadata.sha256,
          },
        });
        return { handled: true };
      }

      return { handled: false };
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        console.warn("Backend analysis timed out, falling back to local parsing.");
      } else {
        console.error("Backend fetch failed, falling back to local:", err);
      }
      return { handled: false };
    } finally {
      clearTimeout(timeoutId);
    }
  }, [onFileUpload]);

  const processPdfBuffer = useCallback(
    async (
      buffer: ArrayBuffer,
      fileName: string,
      password?: string,
      backendMetadata?: BackendMetadata
    ) => {
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
        const positionedLines: PositionedPdfLine[] = [];
        let fullText = "";

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          const items = content.items as Array<{
            str: string;
            transform: number[];
          }>;
          const grouped = new Map<number, Array<{ x: number; text: string }>>();
          items.forEach((item) => {
            fullText += " " + item.str;
            const y = Math.round(item.transform[5]);
            const line = grouped.get(y) || [];
            line.push({ x: item.transform[4], text: item.str });
            grouped.set(y, line);
          });
          Array.from(grouped.entries())
            .sort((a, b) => b[0] - a[0])
            .forEach(([y, cells]) => {
              cells.sort((a, b) => a.x - b.x);
              lines.push(cells.map((cell) => cell.text).join(" ").trim());
              positionedLines.push({ pageNumber, y, items: cells });
            });
        }

        if (onCurrencyDetected) {
          onCurrencyDetected(detectCurrencyFromText(fullText));
        }

        const metadata = extractPdfMetadata(lines);
        const sha256 = await getSha256(buffer);
        let data =
          parsePositionedWalletStatement(positionedLines, fullText) ??
          parsePositionedMoniepointStatement(positionedLines, fullText) ??
          parseStatementPdfLines(lines);

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
              ...(backendMetadata || {
                integrityStatus: "UNVERIFIED",
                integrityWarnings: ["BACKEND_ANALYSIS_UNAVAILABLE"],
              }),
              sha256: backendMetadata?.sha256 ?? sha256,
              openingBalance: backendMetadata?.openingBalance ?? metadata.openingBalance,
              closingBalance: backendMetadata?.closingBalance ?? metadata.closingBalance,
              totalDebits: backendMetadata?.totalDebits ?? metadata.totalDebits,
              totalCredits: backendMetadata?.totalCredits ?? metadata.totalCredits,
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
          setPendingPdfBuffer(buffer);
          setPendingFileName(fileName);
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
          throw new Error("File is too large. The maximum supported size is 100 MB.");
        }

        const extension = file.name.split(".").pop()?.toLowerCase();

        if (extension === "pdf") {
          const backendResult = await uploadToBackend(file);
          if (backendResult.handled) return;
          const buffer = await file.arrayBuffer();
          await processPdfBuffer(buffer, file.name, undefined, backendResult.metadata);
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
        const message = getUserFacingFileError(parseError, extension);
        setError(message);
        onFileError?.(file.name, message);
      } finally {
        setLoadingMessage("Analyzing Statement...");
        setIsLoading(false);
      }
    },
    [onFileUpload, onFileError, onCurrencyDetected, processPdfBuffer, uploadToBackend]
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
        const backendResult = await uploadToBackend(pendingFile, pdfPassword);
        if (backendResult.handled) {
          setIsPasswordModalOpen(false);
          setPendingFile(null);
          setPdfPassword("");
          return;
        }
        await processPdfBuffer(
          await pendingFile.arrayBuffer(),
          pendingFile.name,
          pdfPassword,
          backendResult.metadata
        );
        setPendingFile(null);
        setPdfPassword("");
        return;
      }
      if (pendingPdfBuffer) {
        await processPdfBuffer(pendingPdfBuffer, pendingFileName, pdfPassword);
      }
    } catch {
      const message = "The password did not unlock this PDF. Please verify and try again.";
      setError(message);
      onFileError?.(pendingFileName, message);
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