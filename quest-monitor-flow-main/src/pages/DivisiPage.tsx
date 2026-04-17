import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Pencil, Copy, Link } from "lucide-react";

interface Divisi {
  id: string;
  name: string;
  user_id: string | null;
  pic_email?: string;
  pic_name?: string;
}

export default function DivisiPage() {
  const { user } = useAuth();
  const [divisiList, setDivisiList] = useState<Divisi[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDivisi, setEditingDivisi] = useState<Divisi | null>(null);
  const [editName, setEditName] = useState("");
  const [editPicName, setEditPicName] = useState("");
  const [editPicEmail, setEditPicEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const [form, setForm] = useState({ divisiName: "", picName: "", picEmail: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // --- FIX: Delete confirmation state ---
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingDivisi, setDeletingDivisi] = useState<Divisi | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const { data: companyData } = await supabase
      .from("companies")
      .select("slug")
      .eq("auditor_id", user.id)
      .limit(1)
      .single();
    if (companyData) setCompanySlug(companyData.slug);

    const { data } = await supabase
      .from("divisi")
      .select("id, name, user_id")
      .eq("auditor_id", user.id)
      .order("created_at", { ascending: false });

    if (data && data.length > 0) {
      const userIds = data.filter((d) => d.user_id).map((d) => d.user_id!);
      let profileMap = new Map<string, { email: string; full_name: string }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, email, full_name")
          .in("user_id", userIds);
        (profiles ?? []).forEach((p) => profileMap.set(p.user_id, { email: p.email ?? "", full_name: p.full_name ?? "" }));
      }
      setDivisiList(data.map((d) => ({
        id: d.id,
        name: d.name,
        user_id: d.user_id,
        pic_email: d.user_id ? profileMap.get(d.user_id)?.email ?? "" : "",
        pic_name: d.user_id ? profileMap.get(d.user_id)?.full_name ?? "" : "",
      })));
    } else {
      setDivisiList([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.divisiName.trim() || !form.picName.trim() || !form.picEmail.trim() || !form.password.trim()) return;
    setSubmitting(true);

    const { data: { session } } = await supabase.auth.getSession();

    const { data, error } = await supabase.functions.invoke("create-divisi", {
      body: {
        divisiName: form.divisiName.trim(),
        picName: form.picName.trim(),
        picEmail: form.picEmail.trim(),
        password: form.password,
      },
      headers: {
        Authorization: `Bearer ${session?.access_token}`
      }
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    toast({ title: "Divisi Dibuat", description: `${form.divisiName} berhasil ditambahkan.` });
    setForm({ divisiName: "", picName: "", picEmail: "", password: "" });
    setDialogOpen(false);
    setSubmitting(false);
    load();
  };

  // --- FIX: Open delete confirmation dialog ---
  const openDeleteDialog = (d: Divisi) => {
    setDeletingDivisi(d);
    setDeleteDialogOpen(true);
  };

  // --- FIX: Actual delete with loading state ---
  const handleDelete = async () => {
    if (!deletingDivisi) return;
    setDeleting(true);
    const { error } = await supabase.from("divisi").delete().eq("id", deletingDivisi.id);
    if (error) {
      toast({ title: "Gagal menghapus", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Divisi dihapus", description: `${deletingDivisi.name} berhasil dihapus.` });
      setDivisiList((prev) => prev.filter((d) => d.id !== deletingDivisi.id));
    }
    setDeleting(false);
    setDeleteDialogOpen(false);
    setDeletingDivisi(null);
  };

  const openEdit = (d: Divisi) => {
    setEditingDivisi(d);
    setEditName(d.name);
    setEditPicName(d.pic_name || "");
    setEditPicEmail(d.pic_email || "");
    setEditPassword("");
    setEditDialogOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDivisi || !editName.trim()) return;
    setSubmitting(true);

    const { data: { session } } = await supabase.auth.getSession();

    const body: Record<string, string> = {
      divisiId: editingDivisi.id,
      divisiName: editName.trim(),
      picName: editPicName.trim(),
      picEmail: editPicEmail.trim(),
    };
    if (editPassword.trim()) body.newPassword = editPassword.trim();

    const { data, error } = await supabase.functions.invoke("update-divisi", {
      body,
      headers: {
        Authorization: `Bearer ${session?.access_token}`
      }
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Berhasil", description: "Divisi berhasil diperbarui." });
    }
    setEditDialogOpen(false);
    setEditingDivisi(null);
    setSubmitting(false);
    load();
  };

  const chatbotLink = companySlug ? `${window.location.origin}/audit/${companySlug}` : null;

  // --- FIX: Clipboard with fallback for non-HTTPS environments ---
  const copyLink = async () => {
    if (!chatbotLink) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        // Modern API (HTTPS / localhost)
        await navigator.clipboard.writeText(chatbotLink);
      } else {
        // Fallback: create a temporary textarea element
        const textarea = document.createElement("textarea");
        textarea.value = chatbotLink;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast({ title: "Link Disalin", description: "Link chatbot berhasil disalin ke clipboard." });
    } catch {
      toast({ title: "Gagal menyalin", description: "Silakan salin link secara manual.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Manajemen Divisi</h1>
          <p className="text-muted-foreground">Tambah divisi dan akun login untuk perusahaan Anda</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Tambah Divisi</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Buat Divisi Baru</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Nama Divisi *</Label>
                <Input required value={form.divisiName} onChange={(e) => setForm({ ...form, divisiName: e.target.value })} placeholder="e.g. IT Department" />
              </div>
              <div className="border-t pt-4 space-y-1">
                <p className="text-sm font-medium text-foreground">Akun PIC Divisi</p>
              </div>
              <div className="space-y-2">
                <Label>Nama PIC *</Label>
                <Input required value={form.picName} onChange={(e) => setForm({ ...form, picName: e.target.value })} placeholder="Nama penanggung jawab" />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" required value={form.picEmail} onChange={(e) => setForm({ ...form, picEmail: e.target.value })} placeholder="pic@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <Input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 karakter" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Buat Divisi
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {chatbotLink && (
        <Card className="shadow-card">
          <CardContent className="py-4 flex items-center gap-3">
            <Link className="h-5 w-5 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Link Chatbot Audit</p>
              <p className="text-sm text-muted-foreground truncate">{chatbotLink}</p>
            </div>
            <Button variant="outline" size="sm" onClick={copyLink}>
              <Copy className="h-4 w-4 mr-2" /> Salin Link
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Divisi</TableHead>
                <TableHead>Nama PIC</TableHead>
                <TableHead>Email PIC</TableHead>
                <TableHead className="w-[120px]">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : divisiList.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Belum ada divisi. Klik "Tambah Divisi" untuk membuat.</TableCell></TableRow>
              ) : divisiList.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.pic_name || "—"}</TableCell>
                  <TableCell>{d.pic_email || "—"}</TableCell>
                  {/* --- FIX: Tombol delete sekarang membuka dialog konfirmasi --- */}
                  <TableCell className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(d)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* --- FIX: Delete Confirmation Dialog (style seperti Hapus Auditor) --- */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!deleting) { setDeleteDialogOpen(open); if (!open) setDeletingDivisi(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Hapus Divisi
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Anda akan menghapus divisi berikut secara permanen:
            </p>
            {deletingDivisi && (
              <div className="rounded-lg border bg-muted/50 px-4 py-3 space-y-0.5">
                <p className="font-semibold text-foreground">{deletingDivisi.name}</p>
                {deletingDivisi.pic_email && (
                  <p className="text-sm text-muted-foreground">{deletingDivisi.pic_email}</p>
                )}
                {deletingDivisi.pic_name && (
                  <p className="text-sm text-muted-foreground">{deletingDivisi.pic_name}</p>
                )}
              </div>
            )}
            <p className="text-sm font-medium text-destructive">
              Tindakan ini tidak dapat dibatalkan. Semua data terkait akan dihapus.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => { setDeleteDialogOpen(false); setDeletingDivisi(null); }}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Ya, Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Divisi</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Divisi *</Label>
              <Input required value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="border-t pt-4 space-y-1">
              <p className="text-sm font-medium text-foreground">Data PIC Divisi</p>
            </div>
            <div className="space-y-2">
              <Label>Nama PIC</Label>
              <Input value={editPicName} onChange={(e) => setEditPicName(e.target.value)} placeholder="Nama penanggung jawab" />
            </div>
            <div className="space-y-2">
              <Label>Email PIC</Label>
              <Input type="email" value={editPicEmail} onChange={(e) => setEditPicEmail(e.target.value)} placeholder="pic@company.com" />
            </div>
            <div className="space-y-2">
              <Label>Password Baru (opsional)</Label>
              <Input type="password" minLength={6} value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Kosongkan jika tidak diubah" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}