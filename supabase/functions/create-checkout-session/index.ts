// supabase/functions/create-checkout-session/index.ts
// La app la llama al pulsar "Hazte PRO". Devuelve la URL de pago de Stripe.
import { corsHeaders, getUserFromRequest, json, requireEnv, siteUrl, stripe, supabaseAdmin } from '../_shared/clients.ts';
import { isProStatus } from '../_shared/subscription.ts';

const PRICE_ID = requireEnv('STRIPE_PRICE_ID');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json({ error: 'Inicia sesión para hacerte PRO.' }, 401);

    const [{ data: profile }, { data: billing }] = await Promise.all([
      supabaseAdmin.from('profiles').select('username').eq('id', user.id).maybeSingle(),
      supabaseAdmin.from('billing').select('stripe_customer_id, status').eq('user_id', user.id).maybeSingle()
    ]);

    // Evita pagar dos veces
    if (isProStatus(billing?.status)) {
      return json({ error: 'Ya tienes una suscripción PRO activa.', code: 'already_pro' }, 409);
    }

    // Un cliente de Stripe por usuario (se reutiliza si vuelve a suscribirse)
    let customerId = billing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: profile?.username ?? undefined,
        metadata: { supabase_user_id: user.id }
      });
      customerId = customer.id;
      const { error } = await supabaseAdmin
        .from('billing')
        .upsert({ user_id: user.id, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw new Error(`billing: ${error.message}`);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      subscription_data: { metadata: { supabase_user_id: user.id } },
      metadata: { supabase_user_id: user.id },
      allow_promotion_codes: true,
      locale: 'es',
      success_url: `${siteUrl()}/?pro=success`,
      cancel_url: `${siteUrl()}/?pro=cancel`
    });

    return json({ url: session.url });
  } catch (err) {
    console.error(err);
    return json({ error: 'No se pudo iniciar el pago. Inténtalo de nuevo.' }, 500);
  }
});
