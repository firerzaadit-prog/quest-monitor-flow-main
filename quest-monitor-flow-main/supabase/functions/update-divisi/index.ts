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

    // 1. Cek Sesi (Token)
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

    // 2. Cek Role Auditor ke tabel langsung (Tanpa RPC)
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

    // 3. Baca Form Edit
    const body = await req.json();
    const { divisiId, divisiName, picName, picEmail, newPassword } = body;

    if (!divisiId || !divisiName || !picName || !picEmail) {
      return new Response(JSON.stringify({ error: "Semua field wajib diisi." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Cari user_id PIC dari divisi ini
    const { data: divisiData, error: divError } = await adminClient
      .from("divisi")
      .select("user_id")
      .eq("id", divisiId)
      .single();
      
    if (divError || !divisiData?.user_id) {
       return new Response(JSON.stringify({ error: "Divisi tidak ditemukan." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const divisiUserId = divisiData.user_id;

    // 5. Update Akun Auth Supabase
    const updateData: any = { email: picEmail, user_metadata: { full_name: picName || "" } };
    
    // Update password HANYA JIKA diisi
    if (newPassword && newPassword.trim() !== "") {
        updateData.password = newPassword;
    }

    const { error: userError } = await adminClient.auth.admin.updateUserById(divisiUserId, updateData);

    if (userError) {
      return new Response(JSON.stringify({ error: userError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Update Profil
    await adminClient.from("profiles").update({ email: picEmail, full_name: picName }).eq("user_id", divisiUserId);

    // 7. Update Nama Divisi
    const { error: updateDivisiError } = await adminClient.from("divisi").update({
      name: divisiName,
    }).eq("id", divisiId);

    if (updateDivisiError) {
      return new Response(JSON.stringify({ error: updateDivisiError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});