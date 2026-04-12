import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Send, Loader2, CheckCircle2, ShieldAlert, Clock, AlertTriangle,
  Paperclip, Image, Mic, FileText, X, Download, Bot, User, CheckCircle
} from "lucide-react";
import { generateAuditPDF } from "@/lib/pdfGenerator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface Question {
  id: string;
  question_text: string;
  sort_order: number;
  category: string | null;
}

interface ChatMessage {
  id: string;
  type: "question" | "answer" | "system";
  text: string;
  category?: string | null;
  isPassword?: boolean;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  timestamp?: string;
}

type Phase = "loading" | "not_found" | "no_audit_yet" | "ask_email" | "ask_password" | "audit";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function AuditPublicPage() {
  const { companySlug } = useParams<{ companySlug: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [divisiName, setDivisiName] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [audit, setAudit] = useState<{ id: string; divisi_id: string; company_id: string | null; status: string; expires_at: string | null; duration_minutes: number | null } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timeExpired, setTimeExpired] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [extraTime, setExtraTime] = useState(false);
  const [totalDuration, setTotalDuration] = useState<number | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [acceptTypes, setAcceptTypes] = useState("");

  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const unlockPublicChat = useCallback((resolvedCompanyName: string) => {
    setMessages([
      { id: "welcome", type: "system", text: `Selamat datang di audit ${resolvedCompanyName}.` },
      { id: "ask-email", type: "question", text: "Silakan masukkan email Anda:" },
    ]);
    setPhase("ask_email");
  }, []);

  const fetchPublicAuditStatus = useCallback(async (slug: string) => {
    const { data, error } = await (supabase as any)
      .rpc("get_public_audit_status", { _company_slug: slug })
      .maybeSingle();

    if (error) throw error;
    return data as { company_id: string; company_name: string; has_ongoing_audit: boolean } | null;
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    const resolve = async () => {
      if (!companySlug) { setPhase("not_found"); return; }
      try {
        const data = await fetchPublicAuditStatus(companySlug);
        if (!data) { setPhase("not_found"); return; }

        setCompanyName(data.company_name);
        setCompanyId(data.company_id);

        if (!data.has_ongoing_audit) {
          setPhase("no_audit_yet");
          return;
        }

        unlockPublicChat(data.company_name);
      } catch {
        setPhase("no_audit_yet");
      }
    };
    resolve();
  }, [companySlug, fetchPublicAuditStatus, unlockPublicChat]);

  // Poll for audit start when blocked
  useEffect(() => {
    if (phase !== "no_audit_yet" || !companySlug) return;

    let cancelled = false;

    const checkAuditStatus = async () => {
      try {
        const data = await fetchPublicAuditStatus(companySlug);
        if (!data || cancelled) return;

        setCompanyName(data.company_name);
        setCompanyId(data.company_id);

        if (data.has_ongoing_audit) {
          unlockPublicChat(data.company_name);
        }
      } catch {
        return;
      }
    };

    checkAuditStatus();

    const interval = setInterval(async () => {
      await checkAuditStatus();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase, companySlug, fetchPublicAuditStatus, unlockPublicChat]);

  useEffect(() => {
    if (!audit?.expires_at || completed) return;
    const durationSecs = audit.duration_minutes ? audit.duration_minutes * 60 : null;
    setTotalDuration(durationSecs);
    const calc = () => Math.max(0, Math.floor((new Date(audit.expires_at!).getTime() - Date.now()) / 1000));
    setTimeLeft(calc());
    const interval = setInterval(() => {
      const remaining = calc();
      setTimeLeft(remaining);
      if (remaining <= 0) { setTimeExpired(true); clearInterval(interval); }
    }, 1000);
    return () => clearInterval(interval);
  }, [audit?.expires_at, audit?.duration_minutes, completed]);

  useEffect(() => {
    if (!timeExpired || completed) return;
    if (isAnswering) { setExtraTime(true); } else { completeAuditDueToTime(); }
  }, [timeExpired, isAnswering, completed]);

  const completeAuditDueToTime = useCallback(async () => {
    if (!audit || completed) return;
    setCompleted(true);
    const now = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    const msgs = [...messages, { id: "system-timeout", type: "system" as const, text: "Waktu audit telah habis. Audit selesai secara otomatis.", timestamp: now }];
    setMessages(msgs);

    const { data: allAnswers } = await supabase.from("audit_answers").select("question_id, answer_text").eq("audit_id", audit.id);
    const findings = (allAnswers ?? []).map((a, i) => {
      const q = questions.find(q => q.id === a.question_id);
      return `${i + 1}. ${q?.question_text ?? "Q"}: ${a.answer_text}`;
    }).join("\n");

    const totalQ = questions.length;
    const answeredQ = allAnswers?.length ?? 0;
    const recommendations = answeredQ < totalQ
      ? `Audit tidak selesai (${answeredQ}/${totalQ} pertanyaan dijawab). Disarankan untuk melakukan audit ulang pada bagian yang belum terjawab.`
      : "Berdasarkan hasil audit, disarankan untuk melakukan evaluasi menyeluruh terhadap tata kelola IT.";

    await supabase.from("audit_reports").insert({ audit_id: audit.id, findings, recommendations });
    await supabase.from("audits").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", audit.id);

    const { data: divisiData } = await supabase.from("divisi").select("name").eq("id", audit.divisi_id).single();
    setReportData({ divisi_name: divisiData?.name ?? "—", company_name: companyName, findings, recommendations, generated_at: new Date().toISOString() });
    setShowCompletionDialog(true);
  }, [audit, completed, messages, questions, companyName]);

  const handleLoginEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: "user-email", type: "answer", text: email.trim() },
      { id: "ask-password", type: "question", text: "Masukkan password Anda:" },
    ]);
    setPhase("ask_password");
  };

  const handleLoginPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    setMessages((prev) => [...prev, { id: "user-password", type: "answer", text: "••••••••", isPassword: true }]);

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: password.trim() });
    if (error) {
      setMessages((prev) => [
        ...prev,
        { id: "login-error", type: "system", text: `Login gagal: ${error.message}. Silakan coba lagi.` },
        { id: "ask-email-retry", type: "question", text: "Masukkan email Anda:" },
      ]);
      setEmail(""); setPassword(""); setPhase("ask_email"); setSubmitting(false); return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSubmitting(false); return; }

    const { data: divisi } = await supabase.from("divisi").select("id, name").eq("user_id", user.id).eq("company_id", companyId).limit(1).single();
    if (!divisi) {
      setMessages((prev) => [...prev, { id: "not-divisi", type: "system", text: "Akun Anda tidak terdaftar sebagai divisi di perusahaan ini." }]);
      await supabase.auth.signOut();
      setEmail(""); setPassword(""); setPhase("ask_email"); setSubmitting(false); return;
    }

    setDivisiName(divisi.name ?? "");
    await loadAudit(user.id, divisi.id);
    setSubmitting(false);
  };

  const loadAudit = async (userId: string, divisiId: string) => {
    let { data: auditData } = await supabase
      .from("audits").select("id, divisi_id, company_id, status, expires_at, duration_minutes")
      .eq("divisi_id", divisiId).eq("status", "ongoing").order("created_at", { ascending: false }).limit(1).single();

    if (!auditData) {
      const { data: completedAudit } = await supabase
        .from("audits").select("id, divisi_id, company_id, status, expires_at, duration_minutes")
        .eq("divisi_id", divisiId).eq("status", "completed").order("created_at", { ascending: false }).limit(1).single();

      if (completedAudit) {
        setAudit(completedAudit); setCompleted(true);
        const { data: report } = await supabase.from("audit_reports").select("findings, recommendations, generated_at").eq("audit_id", completedAudit.id).limit(1).single();
        if (report) {
          const { data: divisiData } = await supabase.from("divisi").select("name").eq("id", completedAudit.divisi_id).single();
          setReportData({ divisi_name: divisiData?.name ?? "—", company_name: companyName, findings: report.findings, recommendations: report.recommendations, generated_at: report.generated_at });
        }

        const { data: qs } = await supabase.from("audit_questions").select("*").order("sort_order");
        setQuestions(qs ?? []);
        const { data: existingAnswers } = await supabase.from("audit_answers").select("question_id, answer_text, file_url, file_name, file_type").eq("audit_id", completedAudit.id);

        const newMsgs: ChatMessage[] = [...messages, { id: "login-ok", type: "system", text: "Login berhasil! Audit Anda sudah selesai." }];
        for (const q of qs ?? []) {
          newMsgs.push({ id: `q-${q.id}`, type: "question", text: q.question_text, category: q.category });
          const existing = existingAnswers?.find(a => a.question_id === q.id);
          if (existing) newMsgs.push({ id: `a-${q.id}`, type: "answer", text: existing.answer_text, fileUrl: existing.file_url ?? undefined, fileName: existing.file_name ?? undefined, fileType: existing.file_type ?? undefined });
        }
        newMsgs.push({ id: "system-done", type: "system", text: "Audit telah selesai." });
        setMessages(newMsgs); setPhase("audit"); return;
      }

      setMessages((prev) => [...prev, { id: "no-audit", type: "system", text: "Login berhasil, namun belum ada audit yang ditugaskan untuk divisi Anda." }]);
      setPhase("audit"); return;
    }

    setAudit(auditData);
    const { data: qs } = await supabase.from("audit_questions").select("*").order("sort_order");
    setQuestions(qs ?? []);
    const { data: existingAnswers } = await supabase.from("audit_answers").select("question_id, answer_text, file_url, file_name, file_type").eq("audit_id", auditData.id);

    const newMsgs: ChatMessage[] = [...messages, { id: "login-ok", type: "system", text: "Login berhasil! Mari mulai audit." }];
    let idx = 0;
    for (const q of qs ?? []) {
      newMsgs.push({ id: `q-${q.id}`, type: "question", text: q.question_text, category: q.category });
      const existing = existingAnswers?.find((a) => a.question_id === q.id);
      if (existing) { newMsgs.push({ id: `a-${q.id}`, type: "answer", text: existing.answer_text, fileUrl: existing.file_url ?? undefined, fileName: existing.file_name ?? undefined, fileType: existing.file_type ?? undefined }); idx++; } else break;
    }

    setMessages(newMsgs); setCurrentIndex(idx);
    if (idx >= (qs?.length ?? 0)) setCompleted(true);
    setPhase("audit");
  };

  const handleFileSelect = (type: string) => {
    const accepts: Record<string, string> = { image: "image/*", audio: "audio/*", document: ".pdf,.xlsx,.xls" };
    setAcceptTypes(accepts[type] || "*/*");
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { toast({ title: "File terlalu besar", description: "Maksimal 10MB", variant: "destructive" }); return; }
    setSelectedFile(file);
    if (file.type.startsWith("image/")) { const reader = new FileReader(); reader.onload = (ev) => setFilePreview(ev.target?.result as string); reader.readAsDataURL(file); } else { setFilePreview(null); }
    e.target.value = "";
  };

  const clearFile = () => { setSelectedFile(null); setFilePreview(null); };

  const uploadFile = async (file: File, auditId: string): Promise<{ url: string; name: string; type: string } | null> => {
    const ext = file.name.split(".").pop();
    const path = `${auditId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("audit-files").upload(path, file);
    if (error) { toast({ title: "Upload gagal", description: error.message, variant: "destructive" }); return null; }
    const { data: urlData } = supabase.storage.from("audit-files").getPublicUrl(path);
    return { url: urlData.publicUrl, name: file.name, type: file.type };
  };

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!answer.trim() && !selectedFile) || !audit || submitting) return;
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    setSubmitting(true); setUploading(!!selectedFile);
    const answerText = answer.trim();
    const now = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

    let fileData: { url: string; name: string; type: string } | null = null;
    if (selectedFile) { fileData = await uploadFile(selectedFile, audit.id); if (!fileData && !answerText) { setSubmitting(false); setUploading(false); return; } }

    const { error } = await supabase.from("audit_answers").insert({
      audit_id: audit.id, question_id: currentQ.id,
      answer_text: answerText || (fileData ? `[File: ${fileData.name}]` : ""),
      file_url: fileData?.url ?? null, file_name: fileData?.name ?? null, file_type: fileData?.type ?? null,
    });

    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSubmitting(false); setUploading(false); return; }

    const newMsg: ChatMessage = { id: `a-${currentQ.id}`, type: "answer", text: answerText || `[File: ${fileData?.name}]`, fileUrl: fileData?.url, fileName: fileData?.name, fileType: fileData?.type, timestamp: now };
    const newMsgs = [...messages, newMsg];
    const nextIndex = currentIndex + 1;

    if (nextIndex < questions.length) {
      if (extraTime) {
        newMsgs.push({ id: "system-timeout", type: "system" as const, text: "Extra time selesai. Waktu audit telah habis.", timestamp: now });
        setCompleted(true);

        const { data: allAnswers } = await supabase.from("audit_answers").select("question_id, answer_text").eq("audit_id", audit.id);
        const findings = (allAnswers ?? []).map((a, i) => { const q = questions.find(q => q.id === a.question_id); return `${i + 1}. ${q?.question_text ?? "Q"}: ${a.answer_text}`; }).join("\n");
        const totalQ = questions.length; const answeredQ = allAnswers?.length ?? 0;
        const recommendations = answeredQ < totalQ ? `Audit tidak selesai (${answeredQ}/${totalQ} pertanyaan dijawab). Disarankan untuk melakukan audit ulang.` : "Disarankan untuk melakukan evaluasi menyeluruh terhadap tata kelola IT.";
        await supabase.from("audit_reports").insert({ audit_id: audit.id, findings, recommendations });
        await supabase.from("audits").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", audit.id);

        const { data: divisiData } = await supabase.from("divisi").select("name").eq("id", audit.divisi_id).single();
        setReportData({ divisi_name: divisiData?.name ?? "—", company_name: companyName, findings, recommendations, generated_at: new Date().toISOString() });
        setShowCompletionDialog(true);
      } else {
        setIsTyping(true);
        setTimeout(() => {
          const nextQ = questions[nextIndex];
          setMessages(prev => [...prev, { id: `q-${nextQ.id}`, type: "question" as const, text: nextQ.question_text, category: nextQ.category, timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) }]);
          setIsTyping(false);
        }, 800);
      }
    } else {
      newMsgs.push({ id: "system-done", type: "system" as const, text: "Semua pertanyaan telah dijawab. Audit selesai!", timestamp: now });

      const { data: allAnswers } = await supabase.from("audit_answers").select("question_id, answer_text").eq("audit_id", audit.id);
      const findings = (allAnswers ?? []).map((a, i) => { const q = questions.find(q => q.id === a.question_id); return `${i + 1}. ${q?.question_text ?? "Q"}: ${a.answer_text}`; }).join("\n");
      const recommendations = "Berdasarkan hasil audit, disarankan untuk melakukan evaluasi menyeluruh terhadap tata kelola IT, memperkuat kontrol akses dan keamanan data, serta memastikan semua prosedur terdokumentasi dengan baik.";

      await supabase.from("audit_reports").insert({ audit_id: audit.id, findings, recommendations });
      await supabase.from("audits").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", audit.id);

      const { data: divisiData } = await supabase.from("divisi").select("name").eq("id", audit.divisi_id).single();
      setReportData({ divisi_name: divisiData?.name ?? "—", company_name: companyName, findings, recommendations, generated_at: new Date().toISOString() });
      setCompleted(true);
      setShowCompletionDialog(true);
    }

    setMessages(newMsgs); setCurrentIndex(nextIndex); setAnswer(""); clearFile();
    setSubmitting(false); setUploading(false); setIsAnswering(false);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const timerUrgency = (() => {
    if (timeExpired || (timeLeft !== null && timeLeft < 300)) return "critical";
    if (timeLeft !== null && timeLeft < 600) return "warning";
    return "normal";
  })();

  const timerProgress = (() => {
    if (!totalDuration || timeLeft === null) return 100;
    return Math.max(0, (timeLeft / totalDuration) * 100);
  })();

  const renderFileInMessage = (msg: ChatMessage) => {
    if (!msg.fileUrl) return null;
    const isImage = msg.fileType?.startsWith("image/");
    const isAudio = msg.fileType?.startsWith("audio/");
    if (isImage) return <div className="mt-2"><img src={msg.fileUrl} alt={msg.fileName || "Image"} className="max-w-full rounded-lg max-h-48 object-cover" /></div>;
    if (isAudio) return <div className="mt-2"><audio controls src={msg.fileUrl} className="max-w-full" /></div>;
    return <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-2 text-xs underline opacity-80 hover:opacity-100"><Download className="h-3 w-3" />{msg.fileName || "Download file"}</a>;
  };

  if (phase === "loading") return <div className="flex items-center justify-center min-h-screen bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (phase === "not_found") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center space-y-4 p-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold text-foreground">Link Tidak Valid</h2>
        <p className="text-muted-foreground max-w-sm">Link audit ini tidak ditemukan. Pastikan URL yang Anda gunakan benar.</p>
      </div>
    );
  }

  if (phase === "no_audit_yet") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center space-y-6 p-4">
        <div className="bg-orange-100 dark:bg-orange-900/30 rounded-full p-6">
          <ShieldAlert className="h-16 w-16 text-orange-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Audit Belum Dimulai</h2>
          <p className="text-muted-foreground max-w-md text-base">
            Saat ini belum ada sesi audit yang aktif untuk perusahaan <span className="font-semibold text-foreground">{companyName}</span>. Silakan hubungi auditor Anda untuk informasi lebih lanjut.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2">
          <AlertTriangle className="h-4 w-4" />
          <span>Halaman ini akan aktif setelah auditor memulai sesi audit.</span>
        </div>
      </div>
    );
  }

  const inputDisabled = completed || (timeExpired && !extraTime);
  const showAuditInput = phase === "audit" && !inputDisabled && audit;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with Timer */}
      <div className="bg-primary text-primary-foreground px-5 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary-foreground/15 flex items-center justify-center">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Auditor {companyName}</h1>
            <p className="text-[11px] opacity-60">{divisiName ? `Divisi: ${divisiName}` : "Sesi Audit Aktif"}</p>
          </div>
        </div>
        {phase === "audit" && timeLeft !== null && !completed && (
          <div className={`flex flex-col items-end gap-0.5 min-w-[90px] ${timerUrgency === "critical" ? "animate-pulse" : ""}`}>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 opacity-80" />
              <span className="text-base font-mono font-bold tracking-tight">
                {timeExpired ? "00:00" : formatTime(timeLeft)}
              </span>
            </div>
            <div className="w-full h-1 rounded-full bg-primary-foreground/20 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  timerUrgency === "critical" ? "bg-red-400" : timerUrgency === "warning" ? "bg-amber-400" : "bg-primary-foreground/70"
                }`}
                style={{ width: `${timerProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full p-4 flex flex-col">
        {/* Extra time banner */}
        {extraTime && !completed && (
          <div className="mb-3 flex items-center gap-2 bg-orange-50 text-orange-700 px-4 py-2 rounded-lg text-sm border border-orange-200">
            <AlertTriangle className="h-4 w-4" />
            Extra time: selesaikan jawaban pertanyaan ini. Setelah submit, audit akan ditutup.
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 overflow-hidden flex flex-col rounded-2xl border bg-card shadow-sm">
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ background: "linear-gradient(180deg, hsl(var(--muted)/0.3) 0%, hsl(var(--background)) 100%)" }}>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex items-end gap-2 ${msg.type === "answer" ? "justify-end" : "justify-start"}`}>
                {msg.type === "question" && (
                  <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center" title={`Auditor ${companyName}`}>
                    <Bot className="h-4 w-4 text-primary" aria-label={`Auditor ${companyName}`} />
                  </div>
                )}
                <div className={`max-w-[75%] ${msg.type === "system" ? "w-full max-w-full" : ""}`}>
                  {msg.type === "system" ? (
                    <div className="flex justify-center">
                      <span className="text-xs text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">{msg.text}</span>
                    </div>
                  ) : (
                    <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                      msg.type === "question" ? "bg-card border border-border rounded-bl-md" : "bg-primary text-primary-foreground rounded-br-md"
                    }`}>
                      {msg.category && msg.type === "question" && (
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 mb-1">{msg.category}</p>
                      )}
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      {renderFileInMessage(msg)}
                      {msg.timestamp && (
                        <p className={`text-[10px] mt-1 ${msg.type === "answer" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{msg.timestamp}</p>
                      )}
                    </div>
                  )}
                </div>
                {msg.type === "answer" && (
                  <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary flex items-center justify-center">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex items-end gap-2 justify-start">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" aria-label={`Auditor ${companyName}`} />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Login: Email */}
          {phase === "ask_email" && (
            <form onSubmit={handleLoginEmail} className="border-t p-3 flex gap-2 bg-card">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Anda..." className="flex-1 rounded-full bg-muted/50 border-0 focus-visible:ring-1" autoFocus />
              <Button type="submit" disabled={!email.trim()} size="icon" className="rounded-full"><Send className="h-4 w-4" /></Button>
            </form>
          )}

          {/* Login: Password */}
          {phase === "ask_password" && (
            <form onSubmit={handleLoginPassword} className="border-t p-3 flex gap-2 bg-card">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password Anda..." className="flex-1 rounded-full bg-muted/50 border-0 focus-visible:ring-1" autoFocus />
              <Button type="submit" disabled={!password.trim() || submitting} size="icon" className="rounded-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          )}

          {/* Audit Input */}
          {showAuditInput && (
            <div className="border-t p-3 bg-card">
              {selectedFile && (
                <div className="mb-2 flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                  {filePreview ? <img src={filePreview} alt="preview" className="h-10 w-10 object-cover rounded" /> : <FileText className="h-5 w-5 text-muted-foreground" />}
                  <span className="text-sm text-foreground flex-1 truncate">{selectedFile.name}</span>
                  <span className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(0)} KB</span>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={clearFile}><X className="h-4 w-4" /></Button>
                </div>
              )}
              <form onSubmit={handleSubmitAnswer} className="flex gap-2">
                <input ref={fileInputRef} type="file" accept={acceptTypes} className="hidden" onChange={onFileChange} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground"><Paperclip className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => handleFileSelect("image")}><Image className="h-4 w-4 mr-2" /> Gambar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFileSelect("audio")}><Mic className="h-4 w-4 mr-2" /> Audio</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFileSelect("document")}><FileText className="h-4 w-4 mr-2" /> Dokumen</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Input value={answer} onChange={(e) => { setAnswer(e.target.value); setIsAnswering(true); }} onFocus={() => setIsAnswering(true)} placeholder="Ketik jawaban..." disabled={submitting} className="flex-1 rounded-full bg-muted/50 border-0 focus-visible:ring-1" />
                <Button type="submit" disabled={(!answer.trim() && !selectedFile) || submitting} size="icon" className="rounded-full">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          )}

          {/* Completed footer */}
          {phase === "audit" && inputDisabled && (
            <div className="border-t p-4 flex items-center justify-between bg-card">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Audit Selesai</span>
              </div>
              {reportData && (
                <Button onClick={() => generateAuditPDF(reportData)} variant="outline" size="sm" className="gap-2">
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Completion Dialog */}
      <Dialog open={showCompletionDialog} onOpenChange={setShowCompletionDialog}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center text-center py-4">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle className="h-9 w-9 text-emerald-600" />
            </div>
            <DialogHeader className="items-center">
              <DialogTitle className="text-xl">Audit Telah Selesai!</DialogTitle>
              <DialogDescription className="mt-2">
                Terima kasih telah menyelesaikan sesi audit. Anda dapat mengunduh laporan hasil audit dalam format PDF.
              </DialogDescription>
            </DialogHeader>
            {reportData && (
              <Button onClick={() => { generateAuditPDF(reportData); setShowCompletionDialog(false); }} className="mt-6 gap-2">
                <Download className="h-4 w-4" /> Download Report PDF
              </Button>
            )}
            <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => setShowCompletionDialog(false)}>Tutup</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
