

## Plan: Auto-detect Audit Start pada Halaman Chatbot Publik

### Masalah
Halaman chatbot publik (`/audit/:companySlug`) hanya mengecek sekali saat pertama dimuat apakah ada audit `ongoing`. Ketika auditor memulai audit setelah halaman sudah terbuka, halaman tetap menampilkan "Audit Belum Dimulai" karena tidak ada mekanisme polling atau realtime untuk mendeteksi perubahan.

### Solusi
Tambahkan **polling interval** pada phase `"no_audit_yet"` yang secara berkala (setiap 5 detik) mengecek ulang apakah sudah ada audit `ongoing`. Begitu ditemukan, otomatis pindah ke phase `"ask_email"`.

### Perubahan

**File: `src/pages/AuditPublicPage.tsx`**

1. Tambah `useEffect` baru yang aktif hanya saat `phase === "no_audit_yet"`:
   - Setiap 5 detik, query `audits` table untuk cek audit `ongoing` di company tersebut
   - Jika ditemukan, set phase ke `"ask_email"` dan tampilkan welcome messages
   - Clear interval saat phase berubah atau component unmount

```typescript
useEffect(() => {
  if (phase !== "no_audit_yet" || !companyId) return;
  const interval = setInterval(async () => {
    const { data } = await supabase
      .from("audits")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "ongoing")
      .limit(1)
      .maybeSingle();
    if (data) {
      setMessages([
        { id: "welcome", type: "system", text: `Selamat datang di audit ${companyName}.` },
        { id: "ask-email", type: "question", text: "Silakan masukkan email Anda:" },
      ]);
      setPhase("ask_email");
    }
  }, 5000);
  return () => clearInterval(interval);
}, [phase, companyId, companyName]);
```

### Files yang Diubah

| File | Aksi |
|------|------|
| `src/pages/AuditPublicPage.tsx` | Tambah polling useEffect untuk auto-detect audit start |

