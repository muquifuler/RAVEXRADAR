// supabase/functions/_shared/subscription.ts
// deno-lint-ignore-file no-explicit-any
// Lógica pura (sin dependencias): cómo se traduce una suscripción de Stripe
// a lo que guarda RAVEXRADAR. Se prueba sin Stripe ni Supabase.

// Estados de Stripe en los que el usuario disfruta de PRO.
// past_due = Stripe está reintentando el cobro: se mantiene PRO unos días.
export const PRO_STATUSES = new Set(['active', 'trialing', 'past_due']);

type Obj = Record<string, any>;

const idOf = (v: unknown): string | null =>
  typeof v === 'string' ? v : (v as Obj | null)?.id ?? null;

// En las versiones nuevas de la API de Stripe el fin de periodo está en los items
export function periodEndOf(sub: Obj): number | null {
  return sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
}

export function subscriptionIdOfInvoice(invoice: Obj): string | null {
  return (
    idOf(invoice.subscription) ??
    idOf(invoice.parent?.subscription_details?.subscription) ??
    null
  );
}

export function isProStatus(status: string | null | undefined): boolean {
  return Boolean(status && PRO_STATUSES.has(status));
}

export function userIdFromSubscription(sub: Obj): string | null {
  return sub.metadata?.supabase_user_id ?? null;
}

// Fila de public.billing
export function billingRowFromSubscription(userId: string, sub: Obj) {
  const end = periodEndOf(sub);
  return {
    user_id: userId,
    stripe_customer_id: idOf(sub.customer),
    stripe_subscription_id: sub.id,
    status: sub.status,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    updated_at: new Date().toISOString()
  };
}

// Cambios en public.profiles
export function profilePatchFromSubscription(sub: Obj) {
  const end = periodEndOf(sub);
  return {
    is_pro: isProStatus(sub.status),
    pro_until: end ? new Date(end * 1000).toISOString() : null
  };
}
