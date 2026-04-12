import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, FileDown, Eye } from "lucide-react";
import { generateAuditPDF } from "@/lib/pdfGenerator";

interface ReportItem {
  id: string;
  audit_id: string;
  findings: string | null;
  recommendations: string | null;
  generated_at: string;
  divisi_name: string;
  company_name: string;
  status: string;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewReport, setViewReport] = useState<ReportItem | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("audit_reports")
        .select(`
          id, audit_id, findings, recommendations, generated_at,
          audits:audit_id (
            status,
            divisi:divisi_id ( name ),
            companies:company_id ( company_name )
          )
        `)
        .order("generated_at", { ascending: false });

      if (data) {
        setReports(data.map((r: any) => ({
          id: r.id,
          audit_id: r.audit_id,
          findings: r.findings,
          recommendations: r.recommendations,
          generated_at: r.generated_at,
          divisi_name: r.audits?.divisi?.name ?? "—",
          company_name: r.audits?.companies?.company_name ?? "—",
          status: r.audits?.status ?? "unknown",
        })));
      }
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Audit Reports</h1>
        <p className="text-muted-foreground">View and download completed audit reports per division</p>
      </div>
      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Divisi</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : reports.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No reports available yet</TableCell></TableRow>
              ) : reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.divisi_name}</TableCell>
                  <TableCell>{r.company_name}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "completed" ? "default" : "secondary"}>
                      {r.status === "completed" ? "Completed" : "Incomplete"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(r.generated_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setViewReport(r)}>
                        <Eye className="h-4 w-4 mr-1" /> View
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => generateAuditPDF(r)}>
                        <FileDown className="h-4 w-4 mr-1" /> PDF
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View Report Dialog */}
      <Dialog open={!!viewReport} onOpenChange={(open) => !open && setViewReport(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Report — {viewReport?.divisi_name} ({viewReport?.company_name})
            </DialogTitle>
          </DialogHeader>
          {viewReport && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Generated: {new Date(viewReport.generated_at).toLocaleString()}</span>
                <Badge variant={viewReport.status === "completed" ? "default" : "secondary"}>
                  {viewReport.status === "completed" ? "Completed" : "Incomplete"}
                </Badge>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Findings</h3>
                <pre className="whitespace-pre-wrap text-sm text-muted-foreground bg-muted rounded-lg p-4">
                  {viewReport.findings || "No findings recorded."}
                </pre>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Recommendations</h3>
                <pre className="whitespace-pre-wrap text-sm text-muted-foreground bg-muted rounded-lg p-4">
                  {viewReport.recommendations || "No recommendations recorded."}
                </pre>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => generateAuditPDF(viewReport)} variant="outline" size="sm">
                  <FileDown className="h-4 w-4 mr-1" /> Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
