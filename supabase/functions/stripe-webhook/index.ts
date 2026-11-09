// supabase/functions/stripe-webhook/index.ts
// Stripe llama aquí cada vez que cambia una suscripción. Es quien activa y
// desactiva PRO. Desplegar SIN verificación de JWT (Stripe no tiene sesión):
//   supabase functions deploy stripe-webhook --no-verify-jwt
import Stripe from 'npm:stripe@17';
import { json, requireEnv, stripe, supabaseAdmin } from '../_shared/clients.ts';
import { handleStripeEvent, type WebhookDeps } from './handler.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const webhookSecret = requireEnv('STRIPE_WEBHOOK_SECRET');

const deps: WebhookDeps = {
  retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),

  async findUserIdByCustomer(customerId) {
    if (!customerId) return null;
    const { data } = await supabaseAdmin
      .from('billing')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    return data?.user_id ?? null;
  },

  async saveBilling(row) {
    const { error } = await supabaseAdmin.from('billing').upsert(row, { onConflict: 'user_id' });
    if (error) throw new Error(`billing: ${error.message}`);
  },

  async updateProfile(userId, patch) {
    const { error } = await supabaseAdmin.from('profiles').update(patch).eq('id', userId);
    if (error) throw new Error(`profiles: ${error.message}`);
  }
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return json({ error: 'Falta Stripe-Signature' }, 400);

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    return json({ error: `Firma no válida: ${(err as Error).message}` }, 400);
  }

  try {
    const outcome = await handleStripeEvent(event, deps);
    console.log(event.type, JSON.stringify(outcome));
    return json({ received: true, ...outcome });
  } catch (err) {
    // 500 → Stripe reintenta el evento más tarde
    console.error(event.type, err);
    return json({ error: (err as Error).message }, 500);
  }
});
