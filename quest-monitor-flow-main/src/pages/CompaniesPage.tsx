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
import { Plus, Trash2, Loader2, Building2 } from "lucide-react";

interface Company {
  id: string;
  company_name: string;
  industry: string | null;
  address: string | null;
  contact_person: string | null;
  contact_email: string | null;
}

export default function CompaniesPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ company_name: "", industry: "", address: "", contact_person: "", contact_email: "" });
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const loadCompanies = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("companies").select("*").eq("auditor_id", user.id).order("created_at", { ascending: false });
    setCompanies(data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadCompanies(); }, [user]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.company_name.trim()) return;
    setSubmitting(true);
    const slugVal = form.company_name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const { error } = await supabase.from("companies").insert({
      auditor_id: user.id,
      company_name: form.company_name.trim(),
      slug: slugVal,
      industry: form.industry.trim() || null,
      address: form.address.trim() || null,
      contact_person: form.contact_person.trim() || null,
      contact_email: form.contact_email.trim() || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Company Added" });
      setForm({ company_name: "", industry: "", address: "", contact_person: "", contact_email: "" });
      setDialogOpen(false);
      loadCompanies();
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("companies").delete().eq("id", id);
    loadCompanies();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Companies</h1>
          <p className="text-muted-foreground">Manage your audit client companies</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add Company</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Company</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Company Name *</Label><Input required value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Industry</Label><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></div>
              <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
                <div className="space-y-2"><Label>Contact Email</Label><Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : companies.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No companies yet</TableCell></TableRow>
              ) : companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.company_name}</TableCell>
                  <TableCell>{c.industry ?? "—"}</TableCell>
                  <TableCell>{c.contact_person ?? "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
