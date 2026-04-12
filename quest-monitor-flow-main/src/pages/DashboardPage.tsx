import { useAuth } from "@/hooks/useAuth";
import { SuperAdminDashboard } from "@/components/dashboards/SuperAdminDashboard";
import { AuditorDashboard } from "@/components/dashboards/AuditorDashboard";
import { DivisiDashboard } from "@/components/dashboards/DivisiDashboard";

export default function DashboardPage() {
  const { role } = useAuth();
  if (role === "super_admin") return <SuperAdminDashboard />;
  if (role === "auditor") return <AuditorDashboard />;
  return <DivisiDashboard />;
}
