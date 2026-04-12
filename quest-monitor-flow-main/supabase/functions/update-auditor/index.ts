import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { data: isSuperAdmin } = await adminClient.rpc("has_role", {
      _user_id: caller.id, _role: "super_admin",
    });
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { userId, fullName, email, newPassword, companyName, industry, address, contactPerson, contactEmail } = body;

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update auth user (email + password)
    const authUpdate: Record<string, unknown> = {};
    if (email) authUpdate.email = email.trim();
    if (newPassword && newPassword.length >= 6) authUpdate.password = newPassword;
    if (fullName !== undefined) authUpdate.user_metadata = { full_name: fullName?.trim() || "" };

    if (Object.keys(authUpdate).length > 0) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, authUpdate);
      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update profile
    await adminClient.from("profiles").update({
      email: email?.trim() || null,
      full_name: fullName?.trim() || null,
    }).eq("user_id", userId);

    // Update company
    if (companyName) {
      const companyUpdate: Record<string, unknown> = { company_name: companyName.trim() };
      if (industry !== undefined) companyUpdate.industry = industry?.trim() || null;
      if (address !== undefined) companyUpdate.address = address?.trim() || null;
      if (contactPerson !== undefined) companyUpdate.contact_person = contactPerson?.trim() || null;
      if (contactEmail !== undefined) companyUpdate.contact_email = contactEmail?.trim() || null;

      await adminClient.from("companies").update(companyUpdate).eq("auditor_id", userId);
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
