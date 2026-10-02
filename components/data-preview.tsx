"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { CSVData } from "@/app/page"

interface DataPreviewProps {
  file1Data: CSVData | null
  file2Data: CSVData | null
}

export function DataPreview({ file1Data, file2Data }: DataPreviewProps) {
  const renderTable = (data: CSVData, title: string) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Showing first 10 rows of {data.fileName}
          <Badge variant="outline" className="ml-2">
            {data.rows.length} total rows
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-auto max-h-96">
          <Table>
            <TableHeader>
              <TableRow>
                {data.headers.map((header, index) => (
                  <TableHead key={index} className="font-medium">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.slice(0, 10).map((row, rowIndex) => (
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
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {file1Data && renderTable(file1Data, "File 1 Preview")}
        {file2Data && renderTable(file2Data, "File 2 Preview")}
      </div>

      {!file1Data && !file2Data && (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Upload files to see data preview</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
