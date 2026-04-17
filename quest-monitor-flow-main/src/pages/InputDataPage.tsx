import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Zap, FileText, Save, Loader2, Trash2, File } from "lucide-react";
import { toast } from "sonner";

// ✅ PERUBAHAN 1: "visi_misi" dipecah menjadi "visi" dan "misi" secara terpisah
const CATEGORIES = [
  { key: "visi", label: "Visi" },
  { key: "misi", label: "Misi" },
  { key: "struktur", label: "Struktur Perusahaan, Jobdesk, Data Karyawan per Bagian" },
  { key: "policy", label: "Policy" },
  { key: "sop", label: "SOP" },
  { key: "kpi", label: "KPI" },
  { key: "soal_bobot", label: "Soal & Bobot Soal" },
];

export default function InputDataPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [showAutoDialog, setShowAutoDialog] = useState(false);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: companies = [] } = useQuery({
    queryKey: ["auditor-companies", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, company_name")
        .eq("auditor_id", user!.id)
        .order("company_name");
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (companies.length > 0 && !selectedCompany) {
      setSelectedCompany(companies[0].id);
    }
  }, [companies, selectedCompany]);

  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ["company-documents", selectedCompany],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_documents")
        .select("*")
        .eq("company_id", selectedCompany)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCompany,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ category, content_text }: { category: string; content_text: string }) => {
      const { error } = await supabase.from("company_documents").insert({
        company_id: selectedCompany,
        category,
        content_text,
      });
      if (error) throw error;
    },
    onSuccess: (_, { category }) => {
      toast.success("Data berhasil disimpan");
      setTexts((prev) => ({ ...prev, [category]: "" }));
      queryClient.invalidateQueries({ queryKey: ["company-documents", selectedCompany] });
    },
    onError: () => toast.error("Gagal menyimpan data"),
  });

  const deleteMutation = useMutation({
      // Ubah parameter untuk menerima seluruh objek dokumen, bukan hanya ID-nya
      mutationFn: async (doc: any) => { 
        // 1. Cek apakah dokumen ini memiliki file_url (berarti ini adalah hasil upload file)
        if (doc.file_url) {
          // Ekstrak path file dari URL (mengambil bagian setelah nama bucket 'company-files/')
          const urlParts = doc.file_url.split("/company-files/");
          if (urlParts.length > 1) {
            const filePath = decodeURIComponent(urlParts[1]); // Decode URL untuk menghindari isu karakter
            
            // Hapus file fisik dari Supabase Storage
            const { error: storageError } = await supabase.storage
              .from("company-files")
              .remove([filePath]);

            if (storageError) {
              console.error("Storage delete error:", storageError);
              throw new Error(`Gagal menghapus file dari storage: ${storageError.message}`);
            }
          }
        }

        // 2. Setelah file terhapus (atau jika ini hanya teks), hapus record dari database
        const { error: dbError } = await supabase
          .from("company_documents")
          .delete()
          .eq("id", doc.id);
          
        if (dbError) throw dbError;
      },
      onSuccess: () => {
        toast.success("Data beserta file berhasil dihapus");
        queryClient.invalidateQueries({ queryKey: ["company-documents", selectedCompany] });
      },
      onError: (err: any) => {
        console.error(err);
        toast.error(err.message || "Gagal menghapus");
      },
    });

  // ✅ PERUBAHAN 2: Sanitize nama file agar tidak ada spasi/karakter khusus
  // yang menyebabkan Supabase Storage menolak upload
  const sanitizeFileName = (name: string): string => {
    const ext = name.includes(".") ? "." + name.split(".").pop() : "";
    const base = name.replace(/\.[^/.]+$/, ""); // hapus ekstensi
    const sanitized = base
      .toLowerCase()
      .replace(/\s+/g, "_")           // spasi → underscore
      .replace(/[^a-z0-9_\-]/g, ""); // hapus karakter non-alfanumerik
    return sanitized + ext;
  };

  const handleFileUpload = async (category: string, file: File) => {
    if (!selectedCompany) return;
    setUploading((prev) => ({ ...prev, [category]: true }));
    try {
      // ✅ PERUBAHAN 3: Gunakan nama file yang sudah disanitize
      const safeName = sanitizeFileName(file.name);
      const filePath = `${selectedCompany}/${category}/${Date.now()}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("company-files")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      // ✅ PERUBAHAN 4: Tampilkan pesan error spesifik dari Supabase untuk memudahkan debug
      if (uploadError) {
        console.error("Upload error:", uploadError);
        toast.error(`Gagal mengupload: ${uploadError.message}`);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("company-files")
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase.from("company_documents").insert({
        company_id: selectedCompany,
        category,
        file_url: urlData.publicUrl,
        file_name: file.name, // simpan nama asli untuk ditampilkan ke user
      });

      if (dbError) {
        console.error("DB insert error:", dbError);
        toast.error(`Gagal menyimpan data file: ${dbError.message}`);
        return;
      }

      toast.success(`File "${file.name}" berhasil diupload`);
      queryClient.invalidateQueries({ queryKey: ["company-documents", selectedCompany] });
    } catch (err: any) {
      console.error("Unexpected upload error:", err);
      toast.error(`Error tidak terduga: ${err?.message ?? "Unknown error"}`);
    } finally {
      setUploading((prev) => ({ ...prev, [category]: false }));
    }
  };

  const getCategoryDocs = (category: string) =>
    documents.filter((d) => d.category === category);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Input Data</h1>
        <p className="text-muted-foreground">Masukkan data perusahaan untuk keperluan audit</p>
      </div>

      {companies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Perusahaan: {companies.find(c => c.id === selectedCompany)?.company_name}
            </CardTitle>
          </CardHeader>
        </Card>
      )}

      {selectedCompany && (
        <Tabs defaultValue="manual" className="space-y-4">
          <TabsList>
            <TabsTrigger value="auto" className="gap-2">
              <Zap className="h-4 w-4" /> Input Otomatis
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <FileText className="h-4 w-4" /> Input Manual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="auto">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                <Zap className="h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground text-center max-w-md">
                  Input otomatis memungkinkan data diambil secara otomatis dari sistem yang terhubung.
                </p>
                <Button size="lg" onClick={() => setShowAutoDialog(true)}>
                  Mulai Input Otomatis
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="manual">
            {docsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {CATEGORIES.map((cat) => {
                  const docs = getCategoryDocs(cat.key);
                  return (
                    <AccordionItem key={cat.key} value={cat.key} className="border rounded-lg px-4">
                      <AccordionTrigger className="text-sm font-medium">
                        {cat.label}
                        {docs.length > 0 && (
                          <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            {docs.length}
                          </span>
                        )}
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4 pb-4">
                        {docs.length > 0 && (
                          <div className="space-y-2">
                            {docs.map((doc) => (
                              <div key={doc.id} className="flex items-start gap-2 p-2 bg-muted/50 rounded-md text-sm">
                                {doc.file_name ? (
                                  <a href={doc.file_url!} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-primary hover:underline flex-1 min-w-0">
                                    <File className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{doc.file_name}</span>
                                  </a>
                                ) : (
                                  <p className="flex-1 min-w-0 text-foreground whitespace-pre-wrap">{doc.content_text}</p>
                                )}
                                <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7"
                                  onClick={() => deleteMutation.mutate(doc)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        <Textarea
                          placeholder={`Masukkan ${cat.label}...`}
                          value={texts[cat.key] || ""}
                          onChange={(e) => setTexts((prev) => ({ ...prev, [cat.key]: e.target.value }))}
                          rows={3}
                        />

                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm"
                            disabled={!texts[cat.key]?.trim() || saveMutation.isPending}
                            onClick={() => saveMutation.mutate({ category: cat.key, content_text: texts[cat.key]! })}>
                            <Save className="h-4 w-4 mr-1" /> Simpan Teks
                          </Button>

                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp"
                            className="hidden"
                            ref={(el) => { fileInputRefs.current[cat.key] = el; }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(cat.key, file);
                              e.target.value = "";
                            }}
                          />
                          <Button size="sm" variant="outline"
                            disabled={uploading[cat.key]}
                            onClick={() => fileInputRefs.current[cat.key]?.click()}>
                            {uploading[cat.key] ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4 mr-1" />
                            )}
                            Upload PDF / Foto
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={showAutoDialog} onOpenChange={setShowAutoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fitur Belum Tersedia</DialogTitle>
            <DialogDescription>
              Fitur input otomatis belum terhubung dengan sistem. Harap hubungi developer untuk mengaktifkan fitur ini.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowAutoDialog(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}