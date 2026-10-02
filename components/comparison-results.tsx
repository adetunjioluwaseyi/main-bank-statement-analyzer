"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import type { CSVData, ComparisonResult } from "@/app/page"
import { Play, TrendingUp, AlertTriangle, SlidersHorizontal } from "lucide-react"

interface ComparisonResultsProps {
  file1Data: CSVData | null
  file2Data: CSVData | null
  comparisonResult: ComparisonResult | null
  keyColumn: string
  amountColumn: string
  availableColumns: string[]
  onKeyColumnChange: (value: string) => void
  onAmountColumnChange: (value: string) => void
  onCompare: () => void
}

export function ComparisonResults({
  file1Data,
  file2Data,
  comparisonResult,
  keyColumn,
  amountColumn,
  availableColumns,
  onKeyColumnChange,
  onAmountColumnChange,
  onCompare,
}: ComparisonResultsProps) {
  if (!file1Data || !file2Data) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="font-medium">Two sources required</p>
          <p className="mt-1 text-sm text-muted-foreground">Upload both records to configure a reconciliation run.</p>
        </CardContent>
      </Card>
    )
  }

  const chartData = comparisonResult
    ? [
        {
          name: file1Data.fileName,
          records: comparisonResult.summary.file1Count,
          missing: comparisonResult.summary.missingInFile2Count,
          amount: comparisonResult.summary.file1Sum || 0,
        },
        {
          name: file2Data.fileName,
          records: comparisonResult.summary.file2Count,
          missing: comparisonResult.summary.missingInFile1Count,
          amount: comparisonResult.summary.file2Sum || 0,
        },
      ]
    : []

  const renderMissingTable = (missingData: string[][], headers: string[], title: string) => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          {title}
        </CardTitle>
        <CardDescription>
          <Badge variant="destructive">{missingData.length} missing records</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {missingData.length > 0 ? (
          <div className="rounded-md border overflow-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((header, index) => (
                    <TableHead key={index} className="font-medium">
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {missingData.slice(0, 50).map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <TableCell key={cellIndex} className="font-mono text-sm">
                        {cell || <span className="text-muted-foreground italic">empty</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">No missing records found</p>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/70 bg-[#fbfcfb] pb-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-[#e5f3d4] p-2 text-[#47705d]"><SlidersHorizontal className="h-4 w-4" /></div>
            <div><CardTitle>Set matching rules</CardTitle><CardDescription className="mt-1">Choose the shared identifier and optional amount field.</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Record identifier <span className="text-destructive">*</span></label>
              <Select value={keyColumn} onValueChange={onKeyColumnChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select key column" />
                </SelectTrigger>
                <SelectContent>
                  {availableColumns.map((column) => (
                    <SelectItem key={column} value={column}>
                      {column}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount field <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Select value={amountColumn || "None"} onValueChange={onAmountColumnChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select amount column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  {availableColumns.map((column) => (
                    <SelectItem key={column} value={column}>
                      {column}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={onCompare} disabled={!keyColumn} className="w-full sm:w-auto">
            <Play className="h-4 w-4 mr-2" />
            Run reconciliation
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {comparisonResult && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-border/80 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Source A records</p>
                    <p className="text-2xl font-bold">{comparisonResult.summary.file1Count}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-chart-1" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/80 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Source B records</p>
                    <p className="text-2xl font-bold">{comparisonResult.summary.file2Count}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-chart-2" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/80 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Only in Source B</p>
                    <p className="text-2xl font-bold text-destructive">
                      {comparisonResult.summary.missingInFile1Count}
                    </p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/80 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Only in Source A</p>
                    <p className="text-2xl font-bold text-destructive">
                      {comparisonResult.summary.missingInFile2Count}
                    </p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          {amountColumn && amountColumn !== "None" && (
            <Card className="border-border/80 shadow-sm">
              <CardHeader>
                <CardTitle>Value integrity</CardTitle>
                <CardDescription>Aggregate amount by source for the selected field</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="amount" fill="var(--color-chart-1)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Missing Records Tables */}
          <div className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-[#c85b4c]" /> Exception review <span className="text-muted-foreground">· select a queue to inspect</span></div>
          <Tabs defaultValue="missing-file1" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="missing-file1">Missing in {file1Data.fileName}</TabsTrigger>
              <TabsTrigger value="missing-file2">Missing in {file2Data.fileName}</TabsTrigger>
            </TabsList>

            <TabsContent value="missing-file1" className="space-y-4 pt-4">
              {renderMissingTable(
                comparisonResult.missingInFile1,
                file2Data.headers,
                `Records present in ${file2Data.fileName} but missing in ${file1Data.fileName}`,
              )}
            </TabsContent>

            <TabsContent value="missing-file2" className="space-y-4 pt-4">
              {renderMissingTable(
                comparisonResult.missingInFile2,
                file1Data.headers,
                `Records present in ${file1Data.fileName} but missing in ${file2Data.fileName}`,
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
