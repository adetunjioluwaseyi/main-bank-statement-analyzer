"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { ComparisonResult } from "@/app/page"
import { Download, FileSpreadsheet, FileText } from "lucide-react"

interface ExportSectionProps {
  comparisonResult: ComparisonResult | null
  headers: string[]
}

export function ExportSection({ comparisonResult, headers }: ExportSectionProps) {
  const exportToCSV = (data: string[][], filename: string) => {
    const csvContent = [headers.join(","), ...data.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", filename)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportToJSON = (data: any, filename: string) => {
    const jsonContent = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", filename)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!comparisonResult) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-muted-foreground">Run a comparison to enable export options</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Package the outcome
          </CardTitle>
          <CardDescription>Share exception queues or retain a complete reconciliation record.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
                  <h4 className="font-medium">Run summary</h4>
              <div className="space-y-1 text-sm text-foreground">
                <p>
                  Missing in File 1: <Badge variant="outline">{comparisonResult.summary.missingInFile1Count}</Badge>
                </p>
                <p>
                  Missing in File 2: <Badge variant="outline">{comparisonResult.summary.missingInFile2Count}</Badge>
                </p>
                <p>
                  Total Records:{" "}
                  <Badge variant="outline">
                    {comparisonResult.summary.file1Count + comparisonResult.summary.file2Count}
                  </Badge>
                </p>
              </div>
            </div>

            {comparisonResult.summary.file1Sum !== undefined && (
              <div className="space-y-2">
                  <h4 className="font-medium">Value summary</h4>
                <div className="space-y-1 text-sm text-foreground">
                  <p>
                    File 1 Total: <Badge variant="outline">#{comparisonResult.summary.file1Sum?.toFixed(2)}</Badge>
                  </p>
                  <p>
                    File 2 Total: <Badge variant="outline">#{comparisonResult.summary.file2Sum?.toFixed(2)}</Badge>
                  </p>
                  <p>
                    Difference:{" "}
                    <Badge variant="outline">
                      #
                      {Math.abs(
                        (comparisonResult.summary.file1Sum || 0) - (comparisonResult.summary.file2Sum || 0),
                      ).toFixed(2)}
                    </Badge>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Export Options */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Exception queues (CSV)
                </CardTitle>
                <CardDescription>Download each queue for investigation or follow-up.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full bg-transparent"
                  onClick={() => exportToCSV(comparisonResult.missingInFile1, "missing-in-file1.csv")}
                  disabled={comparisonResult.missingInFile1.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Missing in File 1 ({comparisonResult.missingInFile1.length})
                </Button>

                <Button
                  variant="outline"
                  className="w-full bg-transparent"
                  onClick={() => exportToCSV(comparisonResult.missingInFile2, "missing-in-file2.csv")}
                  disabled={comparisonResult.missingInFile2.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Missing in File 2 ({comparisonResult.missingInFile2.length})
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Reconciliation report (JSON)
                </CardTitle>
                <CardDescription>Keep the full result, summary, and run timestamp together.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full bg-transparent"
                  onClick={() =>
                    exportToJSON(
                      {
                        summary: comparisonResult.summary,
                        missingInFile1: comparisonResult.missingInFile1.map((row) =>
                          Object.fromEntries(headers.map((header, index) => [header, row[index]])),
                        ),
                        missingInFile2: comparisonResult.missingInFile2.map((row) =>
                          Object.fromEntries(headers.map((header, index) => [header, row[index]])),
                        ),
                        exportedAt: new Date().toISOString(),
                      },
                      "reconciliation-report.json",
                    )
                  }
                >
                  <Download className="h-4 w-4 mr-2" />
                  Complete Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
