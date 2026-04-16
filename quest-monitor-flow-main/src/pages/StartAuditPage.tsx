import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { PlayCircle, Loader2, Clock, AlertTriangle } from "lucide-react";

export default function StartAuditPage() {
  const { user } = useAuth();
  const [divisiList, setDivisiList] = useState<{ id: string; name: string; company_id: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [warningMinutes, setWarningMinutes] = useState(10);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    supabase.from("divisi").select("id, name, company_id").eq("auditor_id", user.id).then(({ data }) => {
      setDivisiList(data ?? []);
      setLoading(false);
    });
  }, [user]);

  const totalMinutes = hours * 60 + minutes;
  const warningInvalid = totalMinutes > 0 && warningMinutes >= totalMinutes;

  const handleStart = async () => {
    if (divisiList.length === 0 || totalMinutes <= 0) return;
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

    const records = divisiList.map((d) => ({
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
        description: `${divisiList.length} divisi memulai audit serentak (${hours}j ${minutes}m).`,
      });
      navigate("/monitoring");
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Start New Audit</h1>
        <p className="text-muted-foreground">Mulai audit serentak untuk semua divisi Anda</p>
      </div>

      <Card className="shadow-card">
        <CardContent className="pt-6 space-y-5">
          {/* Divisi list preview */}
          <div className="space-y-2">
            <Label>Divisi yang akan diaudit</Label>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : divisiList.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada divisi. Tambahkan divisi terlebih dahulu.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {divisiList.map((d) => (
                  <span key={d.id} className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm font-medium">
                    {d.name}
                  </span>
                ))}
              </div>
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
              <AlertTriangle className={`h-4 w-4 ${warningInvalid ? "text-destructive" : "text-amber-500"}`} /> Peringatan Waktu
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={totalMinutes > 0 ? totalMinutes - 1 : 59}
                value={warningMinutes}
                onChange={(e) => setWarningMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                className={`w-20 text-center ${warningInvalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
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
            disabled={divisiList.length === 0 || totalMinutes <= 0 || warningInvalid || submitting}
            className="w-full"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Start Audit ({divisiList.length} divisi)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}