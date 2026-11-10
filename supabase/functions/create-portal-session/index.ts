// supabase/functions/create-portal-session/index.ts
// "Gestionar suscripción": portal de Stripe para cancelar, cambiar tarjeta o ver facturas.
import { corsHeaders, getUserFromRequest, json, siteUrl, stripe, supabaseAdmin } from '../_shared/clients.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return json({ error: 'Inicia sesión.' }, 401);

    const { data: billing } = await supabaseAdmin
      .from('billing')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!billing?.stripe_customer_id) {
      return json({ error: 'No tienes ninguna suscripción que gestionar.' }, 404);
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: billing.stripe_customer_id,
      return_url: `${siteUrl()}/?pro=portal`
    });

    return json({ url: portal.url });
  } catch (err) {
    console.error(err);
    return json({ error: 'No se pudo abrir la gestión de la suscripción.' }, 500);
  }
});
