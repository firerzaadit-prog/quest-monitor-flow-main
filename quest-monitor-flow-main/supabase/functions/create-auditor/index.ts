import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = { 
  "Access-Control-Allow-Origin": "*", 
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" 
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Sesi tidak valid / Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Akses Ditolak: Anda bukan Super Admin." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { email, password, fullName, companyName, industry, address, contactPerson, contactEmail } = body;

    if (!email || !password || !companyName) {
      return new Response(JSON.stringify({ error: "Email, Password, dan Nama PT wajib diisi." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1. BUAT USER (AKAN GAGAL JIKA EMAIL SUDAH ADA)
    const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName || "" },
    });

    if (userError) {
      return new Response(JSON.stringify({ error: `Gagal: ${userError.message} (Pastikan email belum terdaftar)` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = userData.user.id;

    // 2. SIMPAN ROLE (JIKA GAGAL, HAPUS USER YANG BARU DIBUAT)
    const { error: roleInsertError } = await adminClient.from("user_roles").insert({ user_id: userId, role: "auditor" });
    if (roleInsertError) {
      await adminClient.auth.admin.deleteUser(userId); // Rollback
      return new Response(JSON.stringify({ error: "Gagal menyimpan hak akses auditor." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 3. SIMPAN COMPANY DENGAN SLUG ANTI-DUPLIKAT
    let slug = companyName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!slug) slug = `company-${Math.floor(Math.random() * 1000)}`;

    const { data: existingCompany } = await adminClient.from("companies").select("id").eq("slug", slug).maybeSingle();
    if (existingCompany) {
      slug = `${slug}-${Math.floor(Math.random() * 10000)}`; // Tambahkan angka acak agar tidak error
    }

    const { error: companyInsertError } = await adminClient.from("companies").insert({
      auditor_id: userId, company_name: companyName, slug, industry: industry || null, address: address || null, contact_person: contactPerson || null, contact_email: contactEmail || null,
    });

    if (companyInsertError) {
      await adminClient.auth.admin.deleteUser(userId); // Rollback
      return new Response(JSON.stringify({ error: "Gagal menyimpan data perusahaan." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, userId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});