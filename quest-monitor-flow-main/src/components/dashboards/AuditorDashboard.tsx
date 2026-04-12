import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTree, Activity, FileText, Building2 } from "lucide-react";

export function AuditorDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ divisi: 0, ongoing: 0, completed: 0, companies: 0 });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [divisi, ongoing, completed, companies] = await Promise.all([
        supabase.from("divisi").select("id", { count: "exact" }).eq("auditor_id", user.id),
        supabase.from("audits").select("id", { count: "exact" }).eq("status", "ongoing"),
        supabase.from("audits").select("id", { count: "exact" }).eq("status", "completed"),
        supabase.from("companies").select("id", { count: "exact" }).eq("auditor_id", user.id),
      ]);
      setStats({
        divisi: divisi.count ?? 0,
        ongoing: ongoing.count ?? 0,
        completed: completed.count ?? 0,
        companies: companies.count ?? 0,
      });
    };
    load();
  }, [user]);

  const cards = [
    { title: "Divisions", value: stats.divisi, icon: FolderTree, color: "text-primary" },
    { title: "Ongoing Audits", value: stats.ongoing, icon: Activity, color: "text-warning" },
    { title: "Completed", value: stats.completed, icon: FileText, color: "text-success" },
    { title: "Companies", value: stats.companies, icon: Building2, color: "text-accent-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Auditor Dashboard</h1>
        <p className="text-muted-foreground">Your audit activity overview</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title} className="shadow-card hover:shadow-card-hover transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
