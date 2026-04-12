import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Activity, FileText, Building2 } from "lucide-react";

export function SuperAdminDashboard() {
  const [stats, setStats] = useState({ auditors: 0, audits: 0, completed: 0, companies: 0 });

  useEffect(() => {
    const load = async () => {
      const [auditors, audits, completed, companies] = await Promise.all([
        supabase.from("user_roles").select("id", { count: "exact" }).eq("role", "auditor"),
        supabase.from("audits").select("id", { count: "exact" }),
        supabase.from("audits").select("id", { count: "exact" }).eq("status", "completed"),
        supabase.from("companies").select("id", { count: "exact" }),
      ]);
      setStats({
        auditors: auditors.count ?? 0,
        audits: audits.count ?? 0,
        completed: completed.count ?? 0,
        companies: companies.count ?? 0,
      });
    };
    load();
  }, []);

  const cards = [
    { title: "Total Auditors", value: stats.auditors, icon: Users, color: "text-primary" },
    { title: "Active Audits", value: stats.audits - stats.completed, icon: Activity, color: "text-warning" },
    { title: "Completed Audits", value: stats.completed, icon: FileText, color: "text-success" },
    { title: "Companies", value: stats.companies, icon: Building2, color: "text-accent-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Super Admin Dashboard</h1>
        <p className="text-muted-foreground">Overview of the entire audit system</p>
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
