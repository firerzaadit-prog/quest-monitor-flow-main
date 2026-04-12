import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Loader2, UserPlus, Pencil } from "lucide-react";

interface Auditor {
  user_id: string;
  email: string;
  full_name: string;
  company_name: string;
}

interface CompanyDetail {
  company_name: string;
  industry: string | null;
  address: string | null;
  contact_person: string | null;
  contact_email: string | null;
}

export default function AuditorManagementPage() {
  const [auditors, setAuditors] = useState<Auditor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    email: "", password: "", fullName: "",
    companyName: "", industry: "", address: "",
    contactPerson: "", contactEmail: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editUserId, setEditUserId] = useState("");
  const [editForm, setEditForm] = useState({
    email: "", fullName: "", newPassword: "",
    companyName: "", industry: "", address: "",
    contactPerson: "", contactEmail: "",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);

  const loadAuditors = async () => {
    setLoading(true);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "auditor");

    if (roles && roles.length > 0) {
      const userIds = roles.map((r) => r.user_id);
      const [profilesRes, companiesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, email, full_name").in("user_id", userIds),
        supabase.from("companies").select("auditor_id, company_name").in("auditor_id", userIds),
      ]);

      const companyMap = new Map<string, string>();
      (companiesRes.data ?? []).forEach((c) => companyMap.set(c.auditor_id, c.company_name));

      setAuditors(
        (profilesRes.data ?? []).map((p) => ({
          user_id: p.user_id,
          email: p.email ?? "",
          full_name: p.full_name ?? "",
          company_name: companyMap.get(p.user_id) ?? "—",
        }))
      );
    } else {
      setAuditors([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadAuditors(); }, []);

  const createAuditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password.trim() || !form.companyName.trim()) return;
    setSubmitting(true);

    // PAKSA AMBIL TOKEN MANUAL
    const { data: { session } } = await supabase.auth.getSession();

    const { data, error } = await supabase.functions.invoke("create-auditor", {
      body: {
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        companyName: form.companyName.trim(),
        industry: form.industry.trim(),
        address: form.address.trim(),
        contactPerson: form.contactPerson.trim(),
        contactEmail: form.contactEmail.trim(),
      },
      // MASUKKAN TOKEN KE HEADERS
      headers: {
        Authorization: `Bearer ${session?.access_token}`
      }
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    toast({ title: "Auditor Dibuat", description: `${form.email} berhasil ditambahkan sebagai auditor untuk ${form.companyName}.` });
    setForm({ email: "", password: "", fullName: "", companyName: "", industry: "", address: "", contactPerson: "", contactEmail: "" });
    setDialogOpen(false);
    setSubmitting(false);
    loadAuditors();
  };

  const openEdit = async (auditor: Auditor) => {
    setEditUserId(auditor.user_id);
    setEditForm({
      email: auditor.email,
      fullName: auditor.full_name,
      newPassword: "",
      companyName: auditor.company_name === "—" ? "" : auditor.company_name,
      industry: "", address: "", contactPerson: "", contactEmail: "",
    });

    // Load full company details
    const { data: company } = await supabase
      .from("companies")
      .select("company_name, industry, address, contact_person, contact_email")
      .eq("auditor_id", auditor.user_id)
      .single();

    if (company) {
      setEditForm((prev) => ({
        ...prev,
        companyName: company.company_name,
        industry: company.industry ?? "",
        address: company.address ?? "",
        contactPerson: company.contact_person ?? "",
        contactEmail: company.contact_email ?? "",
      }));
    }
    setEditDialogOpen(true);
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditSubmitting(true);

    // PAKSA AMBIL TOKEN MANUAL
    const { data: { session } } = await supabase.auth.getSession();

    const { data, error } = await supabase.functions.invoke("update-auditor", {
      body: {
        userId: editUserId,
        fullName: editForm.fullName.trim(),
        email: editForm.email.trim(),
        newPassword: editForm.newPassword || undefined,
        companyName: editForm.companyName.trim(),
        industry: editForm.industry.trim(),
        address: editForm.address.trim(),
        contactPerson: editForm.contactPerson.trim(),
        contactEmail: editForm.contactEmail.trim(),
      },
      // MASUKKAN TOKEN KE HEADERS
      headers: {
        Authorization: `Bearer ${session?.access_token}`
      }
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
      setEditSubmitting(false);
      return;
    }

    toast({ title: "Berhasil", description: "Data auditor berhasil diperbarui." });
    setEditDialogOpen(false);
    setEditSubmitting(false);
    loadAuditors();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Auditor Management</h1>
          <p className="text-muted-foreground">Tambah dan kelola akun auditor beserta perusahaan (PT)</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="h-4 w-4 mr-2" /> Tambah Auditor</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Buat Akun Auditor & PT</DialogTitle>
            </DialogHeader>
            <form onSubmit={createAuditor} className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Data Perusahaan</p>
              </div>
              <div className="space-y-2">
                <Label>Nama PT *</Label>
                <Input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="PT Contoh Indonesia" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Industri</Label>
                  <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Manufaktur" />
                </div>
                <div className="space-y-2">
                  <Label>Contact Person</Label>
                  <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="Nama kontak" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Alamat</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Alamat perusahaan" />
              </div>
              <div className="space-y-2">
                <Label>Email Perusahaan</Label>
                <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="info@perusahaan.com" />
              </div>
              <div className="border-t pt-4 space-y-1">
                <p className="text-sm font-medium text-foreground">Akun Auditor</p>
              </div>
              <div className="space-y-2">
                <Label>Nama Auditor</Label>
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="John Doe" />
              </div>
              <div className="space-y-2">
                <Label>Email Login *</Label>
                <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="auditor@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <Input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 karakter" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Buat Auditor
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Auditor</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Data Perusahaan</p>
            </div>
            <div className="space-y-2">
              <Label>Nama PT</Label>
              <Input value={editForm.companyName} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Industri</Label>
                <Input value={editForm.industry} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Contact Person</Label>
                <Input value={editForm.contactPerson} onChange={(e) => setEditForm({ ...editForm, contactPerson: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Alamat</Label>
              <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email Perusahaan</Label>
              <Input type="email" value={editForm.contactEmail} onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })} />
            </div>
            <div className="border-t pt-4 space-y-1">
              <p className="text-sm font-medium text-foreground">Akun Auditor</p>
            </div>
            <div className="space-y-2">
              <Label>Nama Auditor</Label>
              <Input value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email Login</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Password Baru (kosongkan jika tidak diubah)</Label>
              <Input type="password" minLength={6} value={editForm.newPassword} onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })} placeholder="Min 6 karakter" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Simpan Perubahan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Auditor</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Perusahaan (PT)</TableHead>
                <TableHead className="w-[100px]">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : auditors.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Belum ada auditor. Klik "Tambah Auditor" untuk membuat.</TableCell></TableRow>
              ) : auditors.map((a) => (
                <TableRow key={a.user_id}>
                  <TableCell className="font-medium">{a.full_name || "—"}</TableCell>
                  <TableCell>{a.email}</TableCell>
                  <TableCell>{a.company_name}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={() => openEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}