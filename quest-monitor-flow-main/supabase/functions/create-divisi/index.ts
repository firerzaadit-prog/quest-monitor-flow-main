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
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. Cek Sesi
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Sesi tidak valid / Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 2. Cek Role Auditor ke tabel langsung
    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "auditor")
      .single();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: Anda bukan Auditor." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { divisiName, picName, picEmail, password } = body;

    if (!divisiName || !picName || !picEmail || !password) {
      return new Response(JSON.stringify({ error: "Semua field wajib diisi." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Dapatkan data Perusahaan (Company) milik Auditor ini
    const { data: companies } = await adminClient
      .from("companies")
      .select("id")
      .eq("auditor_id", caller.id)
      .limit(1);

    const companyId = companies?.[0]?.id || null;

    // 4. Buat Akun User untuk Divisi
    const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
      email: picEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: picName },
    });

    if (userError) {
      return new Response(JSON.stringify({ error: userError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // 5. Insert Role Divisi
    await adminClient.from("user_roles").insert({ user_id: userId, role: "divisi" });

    // 6. Insert data ke tabel Divisi
    const { error: divisiError } = await adminClient.from("divisi").insert({
      auditor_id: caller.id,
      name: divisiName,
      company_id: companyId,
      user_id: userId,
    });

    if (divisiError) {
      return new Response(JSON.stringify({ error: divisiError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, userId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});