import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Clock, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface AuditItem {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  started_at: string | null;
  expires_at: string | null;
  duration_minutes: number | null;
  divisi_name: string;
  pic_name: string;
  company_name: string;
  auditor_email: string;
}

function TimeRemaining({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (left <= 0) return <span className="text-destructive font-medium">Habis</span>;

  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const formatted = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;

  return (
    <span className={`font-mono text-sm ${left < 300 ? "text-orange-600 dark:text-orange-400" : "text-foreground"}`}>
      {formatted}
    </span>
  );
}

export default function MonitoringPage() {
  const { role } = useAuth();
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const { toast } = useToast();

  const canManage = role === "super_admin" || role === "auditor";

  const load = async () => {
    setLoading(true);

    // ✅ FIX: Query divisi tanpa kolom pic_name (tidak ada di tabel divisi)
    // Ambil user_id dan auditor_id saja, lalu fetch profiles secara terpisah
    const { data, error } = await supabase
      .from("audits")
      .select(`
        id, status, created_at, completed_at, started_at, expires_at, duration_minutes,
        divisi:divisi_id ( name, auditor_id, user_id, companies:company_id ( company_name ) ),
        companies:company_id ( company_name )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading audits:", error);
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setAudits([]);
      setLoading(false);
      return;
    }

    // Kumpulkan semua user_id (PIC) dan auditor_id yang unik untuk batch fetch
    const allUserIds = new Set<string>();
    const allAuditorIds = new Set<string>();

    for (const audit of data) {
      const divisi = audit.divisi as any;
      if (divisi?.user_id) allUserIds.add(divisi.user_id);
      if (divisi?.auditor_id) allAuditorIds.add(divisi.auditor_id);
    }

    // ✅ FIX: Batch fetch profiles untuk PIC (pic_name diambil dari full_name di profiles)
    const profileMap = new Map<string, { email: string; full_name: string }>();
    if (allUserIds.size > 0) {
      const { data: picProfiles } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", [...allUserIds]);
      (picProfiles ?? []).forEach((p) => {
        profileMap.set(p.user_id, { email: p.email ?? "", full_name: p.full_name ?? "" });
      });
    }

    // ✅ FIX: Batch fetch profiles untuk auditor email
    const auditorMap = new Map<string, string>();
    if (allAuditorIds.size > 0) {
      const { data: auditorProfiles } = await supabase
        .from("profiles")
        .select("user_id, email")
        .in("user_id", [...allAuditorIds]);
      (auditorProfiles ?? []).forEach((p) => {
        auditorMap.set(p.user_id, p.email ?? "");
      });
    }

    // Susun items dari data yang sudah di-fetch
    const items: AuditItem[] = data.map((audit) => {
      const divisi = audit.divisi as any;
      const company = audit.companies as any;

      const picProfile = divisi?.user_id ? profileMap.get(divisi.user_id) : null;
      const auditorEmail = divisi?.auditor_id ? auditorMap.get(divisi.auditor_id) ?? "—" : "—";

      return {
        id: audit.id,
        status: audit.status,
        created_at: audit.created_at,
        completed_at: audit.completed_at,
        started_at: audit.started_at,
        expires_at: audit.expires_at,
        duration_minutes: audit.duration_minutes,
        divisi_name: divisi?.name ?? "—",
        pic_name: picProfile?.full_name || picProfile?.email || "—",
        company_name: company?.company_name ?? "—",
        auditor_email: auditorEmail,
      };
    });

    setAudits(items);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (auditId: string) => {
    setDeleting(auditId);
    await supabase.from("audit_answers").delete().eq("audit_id", auditId);
    await supabase.from("audit_reports").delete().eq("audit_id", auditId);
    const { error } = await supabase.from("audits").delete().eq("id", auditId);

    if (error) {
      toast({ title: "Gagal menghapus", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Audit dihapus" });
      setAudits((prev) => prev.filter((a) => a.id !== auditId));
    }
    setDeleting(null);
  };

  const handleDeleteAll = async () => {
    if (audits.length === 0) return;
    setDeletingAll(true);
    try {
      const idsToDelete = audits.map((a) => a.id);
      await supabase.from("audit_answers").delete().in("audit_id", idsToDelete);
      await supabase.from("audit_reports").delete().in("audit_id", idsToDelete);
      const { error } = await supabase.from("audits").delete().in("id", idsToDelete);
      if (error) throw error;

      toast({ title: "Berhasil", description: `${idsToDelete.length} data audit berhasil dihapus.` });
      setAudits([]);
      setShowDeleteAllDialog(false);
    } catch (error: any) {
      console.error(error);
      toast({ title: "Gagal menghapus", description: error.message, variant: "destructive" });
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Monitoring Audit</h1>
          <p className="text-muted-foreground">Pantau status audit dari divisi-divisi Anda</p>
        </div>

        {audits.length > 0 && canManage && (
          <Button
            variant="destructive"
            onClick={() => setShowDeleteAllDialog(true)}
            className="shrink-0"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Hapus Semua
          </Button>
        )}
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Divisi</TableHead>
                <TableHead>PIC</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Auditor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sisa Waktu</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                {canManage && <TableHead className="w-16">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 9 : 8} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : audits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 9 : 8} className="text-center py-8 text-muted-foreground">
                    No audits found
                  </TableCell>
                </TableRow>
              ) : audits.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.divisi_name}</TableCell>
                  <TableCell>{a.pic_name}</TableCell>
                  <TableCell>{a.company_name}</TableCell>
                  <TableCell>{a.auditor_email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={a.status === "completed" ? "default" : "secondary"}
                      className={a.status === "completed" ? "bg-success text-success-foreground" : ""}
                    >
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {a.status === "ongoing" && a.expires_at ? (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <TimeRemaining expiresAt={a.expires_at} />
                      </div>
                    ) : a.duration_minutes ? (
                      <span className="text-muted-foreground text-sm">{a.duration_minutes}m</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {a.started_at
                      ? new Date(a.started_at).toLocaleString()
                      : new Date(a.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {a.completed_at ? new Date(a.completed_at).toLocaleString() : "—"}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            {deleting === a.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Hapus Audit?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Semua data audit termasuk jawaban dan laporan akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Batal</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(a.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Hapus
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Konfirmasi Hapus Semua */}
      <Dialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Hapus Semua Audit
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Anda akan menghapus <span className="font-bold text-foreground">{audits.length}</span> sesi audit secara permanen.
            </p>
            <p className="text-sm text-destructive font-medium">
              Tindakan ini tidak dapat dibatalkan. Semua data terkait termasuk hasil jawaban dan laporan akan ikut terhapus.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteAllDialog(false)} disabled={deletingAll}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDeleteAll} disabled={deletingAll}>
              {deletingAll && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Ya, Hapus Semua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}