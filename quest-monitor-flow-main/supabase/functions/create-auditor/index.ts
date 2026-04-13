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

    // 1. Cek Sesi User
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Sesi tidak valid / Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Gunakan Akses Admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 3. Cek Role langsung ke tabel (Tanpa RPC)
    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "super_admin")
      .single();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Akses Ditolak: Anda bukan Super Admin." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Baca Data Form
    const body = await req.json();
    const { userId, email, fullName, newPassword, companyName, industry, address, contactPerson, contactEmail } = body;

    if (!userId || !email || !companyName) {
      return new Response(JSON.stringify({ error: "userId, email, dan Nama PT wajib diisi." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Update Akun di Sistem Supabase Auth
    // Kita gunakan tipe 'any' sementara agar TypeScript tidak protes soal password yang opsional
    const updateData: any = { email, user_metadata: { full_name: fullName || "" } };
    
    // Hanya update password jika form password baru diisi
    if (newPassword && newPassword.trim() !== "") {
        updateData.password = newPassword;
    }

    const { error: userError } = await adminClient.auth.admin.updateUserById(userId, updateData);

    if (userError) {
      return new Response(JSON.stringify({ error: userError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Update Profil (Nama & Email di tabel profiles)
    await adminClient.from("profiles").update({ email, full_name: fullName }).eq("user_id", userId);

    // 7. Update Data Perusahaan
    const slug = companyName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    await adminClient.from("companies").update({
      company_name: companyName,
      slug,
      industry: industry || null,
      address: address || null,
      contact_person: contactPerson || null,
      contact_email: contactEmail || null,
    }).eq("auditor_id", userId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});