import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Eye, Pencil, FileDown } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { generateAuditPDF } from "@/lib/pdfGenerator";

interface ReportRow {
  id: string;
  audit_id: string;
  findings: string | null;
  recommendations: string | null;
  generated_at: string;
  audit_status: string;
  divisi_name: string;
  company_name: string;
}

export default function AuditResultsPage() {
  const { role } = useAuth();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast } = useToast();

  const canDelete = role === "super_admin" || role === "auditor";
  const canEdit = role === "super_admin" || role === "auditor";

  // View dialog
  const [viewReport, setViewReport] = useState<ReportRow | null>(null);

  // Edit dialog
  const [editReport, setEditReport] = useState<ReportRow | null>(null);
  const [editFindings, setEditFindings] = useState("");
  const [editRecommendations, setEditRecommendations] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("audit_reports")
      .select("id, audit_id, findings, recommendations, generated_at, audits:audit_id(status, divisi:divisi_id(name), companies:company_id(company_name))")
      .order("generated_at", { ascending: false });

    const mapped: ReportRow[] = (data ?? []).map((r: any) => ({
      id: r.id,
      audit_id: r.audit_id,
      findings: r.findings,
      recommendations: r.recommendations,
      generated_at: r.generated_at,
      audit_status: r.audits?.status ?? "unknown",
      divisi_name: r.audits?.divisi?.name ?? "—",
      company_name: r.audits?.companies?.company_name ?? "—",
    }));

    setReports(mapped);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (report: ReportRow) => {
    setDeleting(report.id);
    await supabase.from("audit_answers").delete().eq("audit_id", report.audit_id);
    await supabase.from("audit_reports").delete().eq("audit_id", report.audit_id);
    const { error } = await supabase.from("audits").delete().eq("id", report.audit_id);

    if (error) {
      toast({ title: "Gagal menghapus", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Audit & report dihapus" });
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    }
    setDeleting(null);
  };

  const handleDownloadPDF = (report: ReportRow) => {
    generateAuditPDF({
      divisi_name: report.divisi_name,
      company_name: report.company_name,
      findings: report.findings,
      recommendations: report.recommendations,
      generated_at: report.generated_at,
    });
  };

  const openEdit = (report: ReportRow) => {
    setEditReport(report);
    setEditFindings(report.findings ?? "");
    setEditRecommendations(report.recommendations ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editReport) return;
    setSaving(true);
    const { error } = await supabase
      .from("audit_reports")
      .update({ findings: editFindings, recommendations: editRecommendations })
      .eq("id", editReport.id);

    if (error) {
      toast({ title: "Gagal menyimpan", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Report berhasil diupdate" });
      setReports((prev) =>
        prev.map((r) =>
          r.id === editReport.id ? { ...r, findings: editFindings, recommendations: editRecommendations } : r
        )
      );
      setEditReport(null);
    }
    setSaving(false);
  };

  const colSpan = canDelete ? 6 : 5;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Audit Results</h1>
        <p className="text-muted-foreground">Laporan audit per divisi — view, edit, dan download PDF</p>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Divisi</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : reports.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Belum ada report</TableCell></TableRow>
              ) : reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.divisi_name}</TableCell>
                  <TableCell>{r.company_name}</TableCell>
                  <TableCell>
                    <Badge variant={r.audit_status === "completed" ? "default" : "secondary"} className={r.audit_status === "completed" ? "bg-success text-success-foreground" : ""}>
                      {r.audit_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(r.generated_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {/* View */}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewReport(r)} title="View">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {/* Edit */}
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {/* PDF */}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownloadPDF(r)} title="Download PDF">
                        <FileDown className="h-4 w-4" />
                      </Button>
                      {/* Delete */}
                      {canDelete && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete">
                              {deleting === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Hapus Audit & Report?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Semua data audit termasuk jawaban dan laporan akan dihapus permanen.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Batal</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(r)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Hapus
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={!!viewReport} onOpenChange={(open) => !open && setViewReport(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report — {viewReport?.divisi_name}</DialogTitle>
            <DialogDescription>{viewReport?.company_name} • {viewReport && new Date(viewReport.generated_at).toLocaleDateString()}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-1">Temuan (Findings)</h4>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3">{viewReport?.findings || "—"}</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground mb-1">Rekomendasi</h4>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3">{viewReport?.recommendations || "—"}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editReport} onOpenChange={(open) => !open && setEditReport(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Report — {editReport?.divisi_name}</DialogTitle>
            <DialogDescription>{editReport?.company_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Temuan (Findings)</label>
              <Textarea value={editFindings} onChange={(e) => setEditFindings(e.target.value)} rows={6} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Rekomendasi</label>
              <Textarea value={editRecommendations} onChange={(e) => setEditRecommendations(e.target.value)} rows={6} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditReport(null)}>Batal</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
