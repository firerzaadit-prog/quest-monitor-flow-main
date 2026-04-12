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
    const { divisiId, divisiName, picName, picEmail, newPassword } = body;

    if (!divisiId || !divisiName) {
      return new Response(JSON.stringify({ error: "divisiId and divisiName are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller owns this divisi
    const { data: divisi } = await adminClient
      .from("divisi")
      .select("id, user_id, auditor_id")
      .eq("id", divisiId)
      .single();

    if (!divisi || divisi.auditor_id !== caller.id) {
      return new Response(JSON.stringify({ error: "Divisi not found or not owned by you" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update divisi name
    await adminClient.from("divisi").update({ name: divisiName.trim() }).eq("id", divisiId);

    // Update PIC user if divisi has a linked user
    if (divisi.user_id) {
      const authUpdate: Record<string, unknown> = {};
      if (picEmail) {
        authUpdate.email = picEmail.trim();
        authUpdate.user_metadata = { full_name: picName?.trim() || "" };
      }
      if (newPassword && newPassword.length >= 6) {
        authUpdate.password = newPassword;
      }
      if (Object.keys(authUpdate).length > 0) {
        await adminClient.auth.admin.updateUserById(divisi.user_id, authUpdate);
      }

      await adminClient.from("profiles").update({
        email: picEmail?.trim() || null,
        full_name: picName?.trim() || null,
      }).eq("user_id", divisi.user_id);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
