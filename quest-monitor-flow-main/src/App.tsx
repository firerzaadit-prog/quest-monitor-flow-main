import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import AuditorManagementPage from "@/pages/AuditorManagementPage";
import MonitoringPage from "@/pages/MonitoringPage";
import ReportsPage from "@/pages/ReportsPage";

import DivisiPage from "@/pages/DivisiPage";
import StartAuditPage from "@/pages/StartAuditPage";
import AuditResultsPage from "@/pages/AuditResultsPage";
import AuditChatPage from "@/pages/AuditChatPage";
import AuditPublicPage from "@/pages/AuditPublicPage";
import InputDataPage from "@/pages/InputDataPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/auditors" element={<ProtectedRoute allowedRoles={["super_admin"]}><AuditorManagementPage /></ProtectedRoute>} />
              <Route path="/monitoring" element={<ProtectedRoute allowedRoles={["super_admin", "auditor"]}><MonitoringPage /></ProtectedRoute>} />
              <Route path="/reports" element={<ReportsPage />} />
              
              <Route path="/divisi" element={<ProtectedRoute allowedRoles={["auditor"]}><DivisiPage /></ProtectedRoute>} />
              <Route path="/start-audit" element={<ProtectedRoute allowedRoles={["auditor"]}><StartAuditPage /></ProtectedRoute>} />
              <Route path="/audit-results" element={<ProtectedRoute allowedRoles={["auditor"]}><AuditResultsPage /></ProtectedRoute>} />
              <Route path="/input-data" element={<ProtectedRoute allowedRoles={["auditor"]}><InputDataPage /></ProtectedRoute>} />
              <Route path="/audit-chat" element={<ProtectedRoute allowedRoles={["divisi"]}><AuditChatPage /></ProtectedRoute>} />
            </Route>

            <Route path="/audit/:companySlug" element={<AuditPublicPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
