"use client";

import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { DataPreview } from "@/components/data-preview";
import { Button } from "@/components/ui/button";

export type StatementMetadata = {
  accountHolder?: string;
  accountType?: string;
  accountNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  openingBalance?: number;
  sha256?: string;
  integrityStatus?: string;
  integrityScore?: number;
  integrityWarnings?: string[];
};

export interface CSVData {
  fileName: string;
  fileSize?: number;
  headers: string[];
  rows: string[][];
  metadata?: StatementMetadata;
}

export interface ComparisonSummary {
  file1Count: number;
  file2Count: number;
  missingInFile1Count: number;
  missingInFile2Count: number;
  file1Sum?: number;
  file2Sum?: number;
}

export interface ComparisonResult {
  summary: ComparisonSummary;
  missingInFile1: string[][];
  missingInFile2: string[][];
}

export default function HomePage() {
  const [statement, setStatement] = useState<CSVData | null>(null);

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Bank Statement Analyzer</p>
          <h1 className="text-3xl font-bold tracking-tight">Statement intake and verification</h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
            Upload a PDF, Excel, or CSV statement to validate the file structure and begin analysis.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <FileUpload
            onFileUpload={setStatement}
            fileNumber={1}
            onCurrencyDetected={() => undefined}
          />
        </div>

        {statement ? (
          <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Loaded statement</h2>
                <p className="text-sm text-muted-foreground">{statement.fileName}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setStatement(null)}>
                Clear
              </Button>
            </div>
            <DataPreview file1Data={statement} file2Data={null} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
