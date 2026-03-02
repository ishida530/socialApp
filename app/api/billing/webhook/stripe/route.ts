import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { PlanTier, Prisma, SubscriptionStatus } from '@prisma/client';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, tooManyRequests } from '@/lib/server/http';
import { getStripeClient } from '@/lib/server/stripe';
import { logError, logEvent } from '@/lib/server/observability';
import { consumeRateLimit, getRequestIp } from '@/lib/server/rate-limit';

function requireStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('Missing required config: STRIPE_WEBHOOK_SECRET');
  }

  return secret;
}

function toPlanTier(value?: string | null) {
  const normalized = value?.toUpperCase();

  if (normalized === 'PRO') {
    return PlanTier.PRO;
  }

  if (normalized === 'PREMIUM') {
    return PlanTier.PREMIUM;
  }

  return PlanTier.FREE;
}

function toSubscriptionStatus(status?: string | null) {
  if (!status) {
    return SubscriptionStatus.ACTIVE;
  }

  if (status === 'active' || status === 'trialing') {
    return SubscriptionStatus.ACTIVE;
  }

  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') {
    return SubscriptionStatus.PAST_DUE;
  }

  return SubscriptionStatus.CANCELED;
}

async function upsertFromStripeSubscription(
  tx: Prisma.TransactionClient,
  subscription: Stripe.Subscription,
) {
  const subscriptionPayload = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };

  const userId = subscription.metadata?.userId;
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

  if (!userId || !customerId) {
    throw new Error('Stripe subscription metadata missing userId/customerId');
  }

  const plan = toPlanTier(subscription.metadata?.plan);
  const status = toSubscriptionStatus(subscription.status);

  await tx.subscription.upsert({
    where: { userId },
    update: {
      plan,
      status,
      provider: 'stripe',
      providerCustomerId: customerId,
      providerSubscriptionId: subscription.id,
      currentPeriodStart: subscriptionPayload.current_period_start
        ? new Date(subscriptionPayload.current_period_start * 1000)
        : null,
      currentPeriodEnd: subscriptionPayload.current_period_end
        ? new Date(subscriptionPayload.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    create: {
      userId,
      plan,
      status,
      provider: 'stripe',
      providerCustomerId: customerId,
      providerSubscriptionId: subscription.id,
      currentPeriodStart: subscriptionPayload.current_period_start
        ? new Date(subscriptionPayload.current_period_start * 1000)
        : null,
      currentPeriodEnd: subscriptionPayload.current_period_end
        ? new Date(subscriptionPayload.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  logEvent('billing-webhook', 'subscription-upserted', {
    userId,
    subscriptionId: subscription.id,
    plan,
    status,
  });
}

async function processStripeEvent(tx: Prisma.TransactionClient, event: Stripe.Event) {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await upsertFromStripeSubscription(tx, event.data.object as Stripe.Subscription);
      break;
    }
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      logEvent('billing-webhook', 'checkout-completed', {
        checkoutSessionId: session.id,
        userId: session.metadata?.userId,
      });
      break;
    }
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      logEvent('billing-webhook', 'invoice-paid', {
        invoiceId: invoice.id,
        customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id,
      });
      break;
    }
    default:
      break;
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const rateLimit = await consumeRateLimit({
      key: `webhook:stripe:${ip}`,
      limit: 120,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return tooManyRequests('Too many webhook requests.', rateLimit.retryAfterSec);
    }

    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return badRequest('Missing stripe-signature header');
    }

    const body = await request.text();
    const stripe = getStripeClient();
    const webhookSecret = requireStripeWebhookSecret();

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    const existingEvent = await prisma.stripeEvent.findUnique({
      where: { id: event.id },
      select: { id: true },
    });

    if (existingEvent) {
      return NextResponse.json({ message: 'Event already processed' });
    }

    await prisma.$transaction(async (tx) => {
      await processStripeEvent(tx, event);

      await tx.stripeEvent.create({
        data: {
          id: event.id,
          type: event.type,
          processed: true,
        },
      });
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    logError('billing-webhook', 'stripe-webhook-error', error);

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json({ message: 'Event already processed' });
    }

    if (
      error instanceof Error &&
      (error.message.startsWith('Missing required config: STRIPE_') ||
        error.message.includes('Stripe subscription metadata missing'))
    ) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}
