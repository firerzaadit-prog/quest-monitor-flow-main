import {
  LayoutDashboard, Users, Building2, FolderTree, FileText,
  Activity, MessageSquare, ClipboardCheck, Settings, LogOut,
  Shield, BarChart3, Database
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const superAdminItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Auditor Management", url: "/auditors", icon: Users },
  { title: "Monitoring", url: "/monitoring", icon: Activity },
  { title: "Reports", url: "/reports", icon: BarChart3 },
];

const auditorItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Divisi", url: "/divisi", icon: FolderTree },
  { title: "Start Audit", url: "/start-audit", icon: ClipboardCheck },
  { title: "Audit Results", url: "/audit-results", icon: FileText },
  { title: "Input Data", url: "/input-data", icon: Database },
  { title: "Monitoring", url: "/monitoring", icon: Activity },
];

const divisiItems = [
  { title: "Audit Chat", url: "/audit-chat", icon: MessageSquare },
  { title: "Reports", url: "/reports", icon: FileText },
];

export function AppSidebar() {
  const { role, signOut, user } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const items = role === "super_admin" ? superAdminItems
    : role === "auditor" ? auditorItems
    : divisiItems;

  const roleLabel = role === "super_admin" ? "Super Admin"
    : role === "auditor" ? "Auditor" : "Divisi";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted">
            {!collapsed && (
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-sidebar-primary" />
                <span className="font-semibold text-sidebar-foreground">Audit System</span>
              </div>
            )}
            {collapsed && <Shield className="h-4 w-4 text-sidebar-primary" />}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="mb-2 px-2">
            <p className="text-xs text-sidebar-muted truncate">{user?.email}</p>
            <p className="text-xs font-medium text-sidebar-primary">{roleLabel}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={signOut}
          className="w-full text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
