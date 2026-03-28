// functions/diagStripeSession/entry.ts
// Diagnostic: retrieves a Stripe checkout session and shows its full metadata.
// Use to verify whether coach_invite_code (and other fields) were captured correctly.
// Call with { sessionId: "cs_live_..." }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import Stripe from 'npm:stripe@17.7.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const { sessionId } = await req.json().catch(() => ({}));
  if (!sessionId) return Response.json({ ok: false, error: "sessionId required" }, { status: 400 });

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    return Response.json({ ok: false, error: "Stripe error: " + (e as Error).message });
  }

  return Response.json({
    ok: true,
    session_id: session.id,
    payment_status: session.payment_status,
    customer_email: session.customer_email,
    amount_total: session.amount_total,
    created: new Date(session.created * 1000).toISOString(),
    metadata: session.metadata,
    // Highlight the fields linkStripePayment reads
    parsed: {
      coach_invite_code: session.metadata?.coach_invite_code || "(empty)",
      athlete_first_name: session.metadata?.athlete_first_name || "(empty)",
      athlete_last_name: session.metadata?.athlete_last_name || "(empty)",
      grad_year: session.metadata?.grad_year || "(empty)",
      sport_id: session.metadata?.sport_id || "(empty)",
      parent_first_name: session.metadata?.parent_first_name || "(empty)",
      parent_last_name: session.metadata?.parent_last_name || "(empty)",
      account_id: session.metadata?.account_id || "(empty)",
      season_year: session.metadata?.season_year || "(empty)",
    },
  });
});
