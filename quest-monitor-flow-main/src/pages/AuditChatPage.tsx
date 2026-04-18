import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Send, Loader2, CheckCircle2, MessageSquare, Clock, AlertTriangle,
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
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  timestamp?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function AuditChatPage() {
  const { user } = useAuth();
  const [audit, setAudit] = useState<{ id: string; divisi_id: string; company_id: string | null; status: string; expires_at: string | null; duration_minutes: number | null } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Countdown timer
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
    const msgs = [...messages, { id: "system-timeout", type: "system" as const, text: "Waktu audit telah habis. Audit selesai secara otomatis.", timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) }];
    setMessages(msgs);

    const { data: allAnswers } = await supabase
      .from("audit_answers").select("question_id, answer_text").eq("audit_id", audit.id);

    const findings = (allAnswers ?? []).map((a, i) => {
      const q = questions.find(q => q.id === a.question_id);
      return `${i + 1}. ${q?.question_text ?? "Q"}: ${a.answer_text}`;
    }).join("\n");

    const totalQ = questions.length;
    const answeredQ = allAnswers?.length ?? 0;
    const recommendations = answeredQ < totalQ
      ? `Audit tidak selesai (${answeredQ}/${totalQ} pertanyaan dijawab). Disarankan untuk melakukan audit ulang pada bagian yang belum terjawab, serta melakukan evaluasi menyeluruh terhadap tata kelola IT.`
      : "Berdasarkan hasil audit, disarankan untuk melakukan evaluasi menyeluruh terhadap tata kelola IT, memperkuat kontrol akses dan keamanan data, serta memastikan semua prosedur terdokumentasi dengan baik.";

    await supabase.from("audit_reports").insert({ audit_id: audit.id, findings, recommendations });
    await supabase.from("audits").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", audit.id);

    const { data: divisiData } = await supabase.from("divisi").select("name").eq("id", audit.divisi_id).single();
    const { data: companyData } = audit.company_id
      ? await supabase.from("companies").select("company_name").eq("id", audit.company_id).single()
      : { data: null };

    setReportData({
      divisi_name: divisiData?.name ?? "—",
      company_name: companyData?.company_name ?? "—",
      findings, recommendations,
      generated_at: new Date().toISOString(),
    });
    setShowCompletionDialog(true);
  }, [audit, completed, messages, questions]);

  useEffect(() => {
    const loadAudit = async () => {
      if (!user) return;
      const { data: divisi } = await supabase
        .from("divisi").select("id").eq("user_id", user.id).limit(1).single();
      if (!divisi) { setLoading(false); return; }

      const { data: auditData } = await supabase
        .from("audits")
        .select("id, divisi_id, company_id, status, expires_at, duration_minutes")
        .eq("divisi_id", divisi.id)
        .eq("status", "ongoing")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!auditData) {
        const { data: completedAudit } = await supabase
          .from("audits")
          .select("id, divisi_id, company_id, status, expires_at, duration_minutes")
          .eq("divisi_id", divisi.id)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (completedAudit) {
          setAudit(completedAudit);
          setCompleted(true);

          const { data: report } = await supabase
            .from("audit_reports")
            .select("findings, recommendations, generated_at")
            .eq("audit_id", completedAudit.id)
            .limit(1)
            .single();

          if (report) {
            const { data: divisiData } = await supabase.from("divisi").select("name").eq("id", completedAudit.divisi_id).single();
            const { data: companyData } = completedAudit.company_id
              ? await supabase.from("companies").select("company_name").eq("id", completedAudit.company_id).single()
              : { data: null };
            setReportData({
              divisi_name: divisiData?.name ?? "—",
              company_name: companyData?.company_name ?? "—",
              findings: report.findings,
              recommendations: report.recommendations,
              generated_at: report.generated_at,
            });
          }

          const { data: qs } = await supabase.from("audit_questions").select("*").order("sort_order");
          setQuestions(qs ?? []);
          const { data: existingAnswers } = await supabase
            .from("audit_answers").select("question_id, answer_text, file_url, file_name, file_type").eq("audit_id", completedAudit.id);

          const msgs: ChatMessage[] = [];
          for (const q of qs ?? []) {
            msgs.push({ id: `q-${q.id}`, type: "question", text: q.question_text, category: q.category });
            const existing = existingAnswers?.find(a => a.question_id === q.id);
            if (existing) {
              msgs.push({
                id: `a-${q.id}`, type: "answer", text: existing.answer_text,
                fileUrl: existing.file_url ?? undefined,
                fileName: existing.file_name ?? undefined,
                fileType: existing.file_type ?? undefined,
              });
            }
          }
          msgs.push({ id: "system-done", type: "system", text: "Audit telah selesai." });
          setMessages(msgs);
        }
        setLoading(false);
        return;
      }

      setAudit(auditData);
      const { data: qs } = await supabase.from("audit_questions").select("*").order("sort_order");
      setQuestions(qs ?? []);

      const { data: existingAnswers } = await supabase
        .from("audit_answers").select("question_id, answer_text, file_url, file_name, file_type").eq("audit_id", auditData.id);

      const msgs: ChatMessage[] = [];
      let idx = 0;
      for (const q of qs ?? []) {
        msgs.push({ id: `q-${q.id}`, type: "question", text: q.question_text, category: q.category });
        const existing = existingAnswers?.find(a => a.question_id === q.id);
        if (existing) {
          msgs.push({
            id: `a-${q.id}`, type: "answer", text: existing.answer_text,
            fileUrl: existing.file_url ?? undefined,
            fileName: existing.file_name ?? undefined,
            fileType: existing.file_type ?? undefined,
          });
          idx++;
        } else break;
      }

      setMessages(msgs);
      setCurrentIndex(idx);
      if (idx >= (qs?.length ?? 0)) setCompleted(true);
      setLoading(false);
    };
    loadAudit();
  }, [user]);

  const handleFileSelect = (type: string) => {
    const accepts: Record<string, string> = { image: "image/*", audio: "audio/*", document: ".pdf,.xlsx,.xls" };
    setAcceptTypes(accepts[type] || "*/*");
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "File terlalu besar", description: "Maksimal 10MB", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setFilePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else { setFilePreview(null); }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!answer.trim() && !selectedFile) || !audit || submitting) return;
    const currentQ = questions[currentIndex];
    if (!currentQ) return;

    setSubmitting(true);
    setUploading(!!selectedFile);
    const answerText = answer.trim();
    const now = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

    let fileData: { url: string; name: string; type: string } | null = null;
    if (selectedFile) {
      fileData = await uploadFile(selectedFile, audit.id);
      if (!fileData && !answerText) { setSubmitting(false); setUploading(false); return; }
    }

    const { error } = await supabase.from("audit_answers").insert({
      audit_id: audit.id, question_id: currentQ.id,
      answer_text: answerText || (fileData ? `[File: ${fileData.name}]` : ""),
      file_url: fileData?.url ?? null, file_name: fileData?.name ?? null, file_type: fileData?.type ?? null,
    });

    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSubmitting(false); setUploading(false); return; }

    const newMsg: ChatMessage = {
      id: `a-${currentQ.id}`, type: "answer", text: answerText || `[File: ${fileData?.name}]`,
      fileUrl: fileData?.url, fileName: fileData?.name, fileType: fileData?.type, timestamp: now,
    };
    const newMsgs = [...messages, newMsg];
    const nextIndex = currentIndex + 1;

    if (nextIndex < questions.length) {
      if (extraTime) {
        newMsgs.push({ id: "system-timeout", type: "system" as const, text: "Extra time selesai. Waktu audit telah habis.", timestamp: now });
        setCompleted(true);
        await supabase.from("audits").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", audit.id);

        const { data: allAnswers } = await supabase.from("audit_answers").select("question_id, answer_text").eq("audit_id", audit.id);
        const findings = (allAnswers ?? []).map((a, i) => {
          const q = questions.find(q => q.id === a.question_id);
          return `${i + 1}. ${q?.question_text ?? "Q"}: ${a.answer_text}`;
        }).join("\n");
        const recommendations = "Berdasarkan hasil audit, disarankan untuk melakukan evaluasi menyeluruh terhadap tata kelola IT.";
        await supabase.from("audit_reports").insert({ audit_id: audit.id, findings, recommendations });

        const { data: divisiData } = await supabase.from("divisi").select("name").eq("id", audit.divisi_id).single();
        const { data: companyData } = audit.company_id
          ? await supabase.from("companies").select("company_name").eq("id", audit.company_id).single()
          : { data: null };
        setReportData({ divisi_name: divisiData?.name ?? "—", company_name: companyData?.company_name ?? "—", findings, recommendations, generated_at: new Date().toISOString() });
        setShowCompletionDialog(true);
      } else {
        // Show typing indicator then next question
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
      const findings = (allAnswers ?? []).map((a, i) => {
        const q = questions.find(q => q.id === a.question_id);
        return `${i + 1}. ${q?.question_text ?? "Q"}: ${a.answer_text}`;
      }).join("\n");
      const recommendations = "Berdasarkan hasil audit, disarankan untuk melakukan evaluasi menyeluruh terhadap tata kelola IT, memperkuat kontrol akses dan keamanan data, serta memastikan semua prosedur terdokumentasi dengan baik.";

      await supabase.from("audit_reports").insert({ audit_id: audit.id, findings, recommendations });
      await supabase.from("audits").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", audit.id);

      const { data: divisiData } = await supabase.from("divisi").select("name").eq("id", audit.divisi_id).single();
      const { data: companyData } = audit.company_id
        ? await supabase.from("companies").select("company_name").eq("id", audit.company_id).single()
        : { data: null };

      setReportData({ divisi_name: divisiData?.name ?? "—", company_name: companyData?.company_name ?? "—", findings, recommendations, generated_at: new Date().toISOString() });
      setCompleted(true);
      setShowCompletionDialog(true);
    }

    setMessages(newMsgs);
    setCurrentIndex(nextIndex);
    setAnswer("");
    clearFile();
    setSubmitting(false);
    setUploading(false);
    setIsAnswering(false);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const getTimerColor = () => {
    if (timeExpired) return "text-destructive";
    if (timeLeft !== null && timeLeft < 300) return "text-destructive";
    if (timeLeft !== null && timeLeft < 600) return "text-orange-600";
    return "text-emerald-600";
  };

  const getTimerPillBg = () => {
    if (timeExpired || (timeLeft !== null && timeLeft < 300)) return "bg-destructive/10 border-destructive/30";
    if (timeLeft !== null && timeLeft < 600) return "bg-orange-50 border-orange-200";
    return "bg-emerald-50 border-emerald-200";
  };

  const renderFileInMessage = (msg: ChatMessage) => {
    if (!msg.fileUrl) return null;
    const isImage = msg.fileType?.startsWith("image/");
    const isAudio = msg.fileType?.startsWith("audio/");
    if (isImage) return <div className="mt-2"><img src={msg.fileUrl} alt={msg.fileName || "Image"} className="max-w-full rounded-lg max-h-48 object-cover" /></div>;
    if (isAudio) return <div className="mt-2"><audio controls src={msg.fileUrl} className="max-w-full" /></div>;
    return (
      <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-2 text-xs underline opacity-80 hover:opacity-100">
        <Download className="h-3 w-3" />{msg.fileName || "Download file"}
      </a>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!audit) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <MessageSquare className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-foreground">No Active Audit</h2>
        <p className="text-muted-foreground max-w-sm">There is no ongoing audit assigned to you. Please contact your auditor to start an audit session.</p>
      </div>
    );
  }

  const inputDisabled = completed || (timeExpired && !extraTime);

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-3">
        <h1 className="text-2xl font-semibold text-foreground">Audit Chat</h1>
        <p className="text-muted-foreground text-sm">
          {completed ? "Audit completed" : `Pertanyaan ${Math.min(currentIndex + 1, questions.length)} dari ${questions.length}`}
        </p>
      </div>

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
              {/* Bot avatar */}
              {msg.type === "question" && (
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}

              <div className={`max-w-[75%] ${msg.type === "system" ? "w-full max-w-full" : ""}`}>
                {msg.type === "system" ? (
                  <div className="flex justify-center">
                    <span className="text-xs text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
                      {msg.text}
                    </span>
                  </div>
                ) : (
                  <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                    msg.type === "question"
                      ? "bg-card border border-border rounded-bl-md"
                      : "bg-primary text-primary-foreground rounded-br-md"
                  }`}>
                    {msg.category && msg.type === "question" && (
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 mb-1">{msg.category}</p>
                    )}
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    {renderFileInMessage(msg)}
                    {msg.timestamp && (
                      <p className={`text-[10px] mt-1 ${msg.type === "answer" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {msg.timestamp}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* User avatar */}
              {msg.type === "answer" && (
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex items-end gap-2 justify-start">
              <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
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

        {/* Input area */}
        {!inputDisabled ? (
          <div className="border-t bg-card p-3">
            {selectedFile && (
              <div className="mb-2 flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                {filePreview ? (
                  <img src={filePreview} alt="preview" className="h-10 w-10 object-cover rounded" />
                ) : (
                  <FileText className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-sm text-foreground flex-1 truncate">{selectedFile.name}</span>
                <span className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(0)} KB</span>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={clearFile}><X className="h-4 w-4" /></Button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input ref={fileInputRef} type="file" accept={acceptTypes} className="hidden" onChange={onFileChange} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => handleFileSelect("image")}><Image className="h-4 w-4 mr-2" /> Gambar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleFileSelect("audio")}><Mic className="h-4 w-4 mr-2" /> Audio</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleFileSelect("document")}><FileText className="h-4 w-4 mr-2" /> Dokumen</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Input
                value={answer}
                onChange={(e) => { setAnswer(e.target.value); setIsAnswering(true); }}
                onFocus={() => setIsAnswering(true)}
                placeholder="Ketik jawaban..."
                disabled={submitting}
                className="flex-1 rounded-full bg-muted/50 border-0 focus-visible:ring-1"
              />
              <Button type="submit" disabled={(!answer.trim() && !selectedFile) || submitting} size="icon" className="rounded-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        ) : (
          <div className="border-t p-4 flex items-center justify-between bg-card">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Audit Selesai</span>
            </div>
            {reportData && (
              <Button onClick={() => generateAuditPDF(reportData)} variant="outline" size="sm" className="gap-2">
                <Download className="h-3.5 w-3.5" />
                Download PDF
              </Button>
            )}
          </div>
        )}
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
                <Download className="h-4 w-4" />
                Download Report PDF
              </Button>
            )}
            <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => setShowCompletionDialog(false)}>
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}