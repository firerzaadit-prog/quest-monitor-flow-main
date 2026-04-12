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

interface AuditItem {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  started_at: string | null;
  expires_at: string | null;
  duration_minutes: number | null;
  divisi_name: string;
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
  const { toast } = useToast();

  const canDelete = role === "super_admin" || role === "auditor";

  const load = async () => {
    const { data } = await supabase
      .from("audits")
      .select(`
        id, status, created_at, completed_at, started_at, expires_at, duration_minutes,
        divisi:divisi_id ( name, auditor_id, companies:company_id ( company_name ) ),
        companies:company_id ( company_name )
      `)
      .order("created_at", { ascending: false });

    if (data) {
      const items: AuditItem[] = [];
      for (const audit of data) {
        const divisi = audit.divisi as any;
        const company = audit.companies as any;
        let auditorEmail = "";
        if (divisi?.auditor_id) {
          const { data: profile } = await supabase
            .from("profiles").select("email").eq("user_id", divisi.auditor_id).single();
          auditorEmail = profile?.email ?? "";
        }
        items.push({
          id: audit.id,
          status: audit.status,
          created_at: audit.created_at,
          completed_at: audit.completed_at,
          started_at: audit.started_at,
          expires_at: audit.expires_at,
          duration_minutes: audit.duration_minutes,
          divisi_name: divisi?.name ?? "—",
          company_name: company?.company_name ?? "—",
          auditor_email: auditorEmail,
        });
      }
      setAudits(items);
    }
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Audit Monitoring</h1>
        <p className="text-muted-foreground">Track all audit activities across the system</p>
      </div>
      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Divisi</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Auditor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sisa Waktu</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                {canDelete && <TableHead className="w-16">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={canDelete ? 8 : 7} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : audits.length === 0 ? (
                <TableRow><TableCell colSpan={canDelete ? 8 : 7} className="text-center py-8 text-muted-foreground">No audits found</TableCell></TableRow>
              ) : audits.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.divisi_name}</TableCell>
                  <TableCell>{a.company_name}</TableCell>
                  <TableCell>{a.auditor_email}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === "completed" ? "default" : "secondary"} className={a.status === "completed" ? "bg-success text-success-foreground" : ""}>
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
                    {a.started_at ? new Date(a.started_at).toLocaleString() : new Date(a.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{a.completed_at ? new Date(a.completed_at).toLocaleString() : "—"}</TableCell>
                  {canDelete && (
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            {deleting === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
                            <AlertDialogAction onClick={() => handleDelete(a.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
    </div>
  );
}
