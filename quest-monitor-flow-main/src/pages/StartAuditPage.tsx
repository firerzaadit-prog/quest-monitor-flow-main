import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { PlayCircle, Loader2, Clock, AlertTriangle, CheckSquare, Square } from "lucide-react";

interface Divisi {
  id: string;
  name: string;
  company_id: string | null;
}

export default function StartAuditPage() {
  const { user } = useAuth();
  const [divisiList, setDivisiList] = useState<Divisi[]>([]);
  const [selectedDivisi, setSelectedDivisi] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [warningMinutes, setWarningMinutes] = useState(10);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    supabase
      .from("divisi")
      .select("id, name, company_id")
      .eq("auditor_id", user.id)
      .then(({ data }) => {
        const list = data ?? [];
        setDivisiList(list);
        // Default: pilih semua divisi
        setSelectedDivisi(new Set(list.map((d) => d.id)));
        setLoading(false);
      });
  }, [user]);

  const totalMinutes = hours * 60 + minutes;
  const warningInvalid = totalMinutes > 0 && warningMinutes >= totalMinutes;
  const selectedCount = selectedDivisi.size;
  const allSelected = divisiList.length > 0 && selectedCount === divisiList.length;
  const someSelected = selectedCount > 0 && selectedCount < divisiList.length;

  const toggleDivisi = (id: string) => {
    setSelectedDivisi((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedDivisi(new Set());
    } else {
      setSelectedDivisi(new Set(divisiList.map((d) => d.id)));
    }
  };

  const handleStart = async () => {
    if (selectedCount === 0 || totalMinutes <= 0) return;
    if (warningInvalid) {
      toast({
        title: "Peringatan Waktu Tidak Valid",
        description: `Peringatan waktu (${warningMinutes} menit) harus lebih kecil dari durasi audit (${totalMinutes} menit).`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + totalMinutes * 60 * 1000);

    const selectedList = divisiList.filter((d) => selectedDivisi.has(d.id));
    const records = selectedList.map((d) => ({
      divisi_id: d.id,
      company_id: d.company_id ?? null,
      status: "ongoing",
      duration_minutes: totalMinutes,
      warning_minutes: warningMinutes > 0 ? warningMinutes : null,
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    }));

    const { error } = await supabase.from("audits").insert(records);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Audit Dimulai",
        description: `${selectedCount} divisi memulai audit serentak (${hours}j ${minutes}m).`,
      });
      navigate("/monitoring");
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Start New Audit</h1>
        <p className="text-muted-foreground">Pilih divisi dan mulai audit serentak</p>
      </div>

      <Card className="shadow-card">
        <CardContent className="pt-6 space-y-5">

          {/* Divisi selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Pilih Divisi yang akan diaudit</Label>
              {divisiList.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  {allSelected ? (
                    <CheckSquare className="h-3.5 w-3.5" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                  {allSelected ? "Batal Pilih Semua" : "Pilih Semua"}
                </button>
              )}
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : divisiList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada divisi. Tambahkan divisi terlebih dahulu.
              </p>
            ) : (
              <div className="border rounded-lg divide-y">
                {divisiList.map((d) => {
                  const checked = selectedDivisi.has(d.id);
                  return (
                    <label
                      key={d.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                        checked ? "bg-primary/5" : ""
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleDivisi(d.id)}
                        id={`divisi-${d.id}`}
                      />
                      <span className={`text-sm font-medium ${checked ? "text-foreground" : "text-muted-foreground"}`}>
                        {d.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Summary badge */}
            {divisiList.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedCount === 0
                  ? "Belum ada divisi yang dipilih"
                  : `${selectedCount} dari ${divisiList.length} divisi dipilih`}
              </p>
            )}
          </div>

          {/* Duration input */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> Durasi Audit
            </Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={hours}
                  onChange={(e) => setHours(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 text-center"
                />
                <span className="text-sm text-muted-foreground">jam</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="w-20 text-center"
                />
                <span className="text-sm text-muted-foreground">menit</span>
              </div>
            </div>
            {totalMinutes > 0 && (
              <p className="text-xs text-muted-foreground">Total: {totalMinutes} menit</p>
            )}
          </div>

          {/* Warning time input */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <AlertTriangle
                className={`h-4 w-4 ${warningInvalid ? "text-destructive" : "text-amber-500"}`}
              />
              Peringatan Waktu
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={totalMinutes > 0 ? totalMinutes - 1 : 59}
                value={warningMinutes}
                onChange={(e) => setWarningMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                className={`w-20 text-center ${
                  warningInvalid ? "border-destructive focus-visible:ring-destructive" : ""
                }`}
              />
              <span className="text-sm text-muted-foreground">menit sebelum habis</span>
            </div>
            {warningInvalid ? (
              <p className="text-xs text-destructive font-medium">
                ⚠ Peringatan waktu harus lebih kecil dari durasi audit ({totalMinutes} menit).
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Peserta akan menerima notifikasi saat {warningMinutes} menit tersisa.
              </p>
            )}
          </div>

          <Button
            onClick={handleStart}
            disabled={selectedCount === 0 || totalMinutes <= 0 || warningInvalid || submitting}
            className="w-full"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <PlayCircle className="h-4 w-4 mr-2" />
            )}
            Start Audit ({selectedCount} divisi)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}