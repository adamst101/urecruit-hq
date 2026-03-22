// base44/functions/createAccount/entry.ts
// Creates a new user account via Supabase admin API and returns a session token.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment variables.
// Both are available in the Supabase Dashboard → Project Settings → API.

import { createClient } from "npm:@supabase/supabase-js@2";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ ok: false, error: "POST only" }, { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { ok: false, error: "Account creation is not configured on this server.", code: "NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  let body: { email?: string; password?: string } = {};
  try { body = await req.json(); } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ ok: false, error: "A valid email address is required." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return Response.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create the user — email_confirm:true skips the verification email so access is immediate
  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    const msg = createError.message || "";
    if (
      msg.includes("already registered") ||
      msg.includes("already exists") ||
      (createError as any).code === "23505"
    ) {
      return Response.json(
        { ok: false, error: "An account with this email already exists.", code: "DUPLICATE" },
        { status: 409 }
      );
    }
    console.error("createAccount: createUser failed:", msg);
    return Response.json({ ok: false, error: "Account creation failed. Please try again." }, { status: 400 });
  }

  // Sign in to obtain a session token the frontend can use
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !signInData?.session?.access_token) {
    console.error("createAccount: signIn after create failed:", signInError?.message);
    return Response.json(
      {
        ok: false,
        error: "Account created but sign-in failed. Please sign in manually.",
        code: "SIGNIN_FAILED",
      },
      { status: 500 }
    );
  }

  return Response.json({
    ok: true,
    accessToken: signInData.session.access_token,
  });
});
