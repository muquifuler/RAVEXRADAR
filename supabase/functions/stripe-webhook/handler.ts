// supabase/functions/stripe-webhook/handler.ts
// deno-lint-ignore-file no-explicit-any
// Procesa un evento de Stripe. Recibe sus dependencias (Stripe y Supabase)
// desde index.ts, así se puede probar con datos falsos.
import {
  billingRowFromSubscription,
  profilePatchFromSubscription,
  subscriptionIdOfInvoice,
  userIdFromSubscription
} from '../_shared/subscription.ts';

type Obj = Record<string, any>;

export interface WebhookDeps {
  retrieveSubscription(id: string): Promise<Obj>;
  findUserIdByCustomer(customerId: string): Promise<string | null>;
  saveBilling(row: Obj): Promise<void>;
  updateProfile(userId: string, patch: Obj): Promise<void>;
}

const idOf = (v: unknown): string | null =>
  typeof v === 'string' ? v : (v as Obj | null)?.id ?? null;

// Siempre se vuelve a leer la suscripción de Stripe: los eventos pueden llegar
// desordenados y así se guarda el estado real más reciente.
async function syncSubscription(subscriptionId: string, deps: WebhookDeps, hintUserId?: string | null) {
  const sub = await deps.retrieveSubscription(subscriptionId);
  const userId =
    hintUserId ||
    userIdFromSubscription(sub) ||
    (await deps.findUserIdByCustomer(idOf(sub.customer) ?? ''));

  if (!userId) return { result: 'no-user', subscriptionId };

  await deps.saveBilling(billingRowFromSubscription(userId, sub));
  const patch = profilePatchFromSubscription(sub);
  await deps.updateProfile(userId, patch);
  return { result: 'synced', userId, status: sub.status, is_pro: patch.is_pro };
}

export async function handleStripeEvent(event: Obj, deps: WebhookDeps) {
  const obj = event.data?.object ?? {};

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if (obj.mode !== 'subscription' || !obj.subscription) return { result: 'ignored' };
      return await syncSubscription(idOf(obj.subscription)!, deps, obj.client_reference_id);
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return await syncSubscription(obj.id, deps);

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const subId = subscriptionIdOfInvoice(obj);
      return subId ? await syncSubscription(subId, deps) : { result: 'ignored' };
    }

    default:
      return { result: 'ignored', type: event.type };
  }
}
