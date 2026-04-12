import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
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

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAuditor } = await adminClient.rpc("has_role", {
      _user_id: caller.id, _role: "auditor",
    });
    if (!isAuditor) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { divisiName, picName, picEmail, password } = body;

    if (!divisiName || !picName || !picEmail || !password) {
      return new Response(JSON.stringify({ error: "divisiName, picName, picEmail, and password are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get auditor's company
    const { data: companies } = await adminClient
      .from("companies")
      .select("id")
      .eq("auditor_id", caller.id)
      .limit(1);

    const companyId = companies?.[0]?.id || null;

    // Create divisi user account
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

    // Insert role
    await adminClient.from("user_roles").insert({ user_id: userId, role: "divisi" });

    // Insert divisi record
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
