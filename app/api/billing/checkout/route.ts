import { NextRequest, NextResponse } from 'next/server';
import { PlanTier, SubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { setUserPlan } from '@/lib/server/subscription';
import { resolveBillingMode } from '@/lib/server/billing-mode';
import { NEW_USER_PRO_TRIAL_DAYS, type BillingInterval } from '@/lib/billing/plans';
import {
  getStripeClient,
  resolveStripePriceId,
  resolveStripeReturnUrls,
} from '@/lib/server/stripe';
import { prisma } from '@/lib/server/prisma';

type PaidPlanTier = Exclude<PlanTier, 'FREE'>;

function parseRequestedPlan(value?: string) {
  const plan = value?.toUpperCase();
  if (plan === 'STARTER' || plan === 'PRO' || plan === 'BUSINESS') {
    return plan as PaidPlanTier;
  }

  return null;
}

function parseBillingInterval(value?: string): BillingInterval {
  return value?.toUpperCase() === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
}

async function stripeCustomerExists(stripe: Stripe, customerId: string) {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return !('deleted' in customer && customer.deleted);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      'message' in error &&
      (error as { type?: string }).type === 'StripeInvalidRequestError' &&
      typeof (error as { message?: string }).message === 'string' &&
      (error as { message: string }).message.toLowerCase().includes('no such customer')
    ) {
      return false;
    }

    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json()) as { plan?: string; interval?: string };
    const requestedPlan = parseRequestedPlan(body.plan);
    const billingInterval = parseBillingInterval(body.interval);

    if (!requestedPlan) {
      return badRequest('Checkout wspiera plany STARTER, PRO lub BUSINESS.');
    }

    const billingMode = resolveBillingMode();

    if (billingMode === 'mock') {
      const subscription = await setUserPlan(user.userId, requestedPlan);

      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
      const mockCheckoutUrl = new URL('/billing', frontendUrl);
      mockCheckoutUrl.searchParams.set('checkout', 'success');
      mockCheckoutUrl.searchParams.set('plan', requestedPlan);

      return NextResponse.json({
        success: true,
        mode: 'mock',
        billingInterval,
        message: 'Plan został zaktualizowany lokalnie (mock checkout).',
        url: mockCheckoutUrl.toString(),
        subscription,
      });
    }

    const stripe = getStripeClient();
    const [stripePriceId, userRecord] = await Promise.all([
      resolveStripePriceId(requestedPlan, billingInterval),
      prisma.user.findUnique({
        where: { id: user.userId },
        select: { id: true, email: true, name: true },
      }),
    ]);

    if (!userRecord) {
      return badRequest('Nie znaleziono użytkownika dla checkout.');
    }

    const existingSubscription = await prisma.subscription.findUnique({
      where: { userId: user.userId },
      select: { providerCustomerId: true, providerSubscriptionId: true },
    });

    let customerId = existingSubscription?.providerCustomerId ?? null;
    if (customerId) {
      const isValidCustomer = await stripeCustomerExists(stripe, customerId);
      if (!isValidCustomer) {
        customerId = null;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userRecord.email,
        name: userRecord.name,
        metadata: {
          userId: userRecord.id,
        },
      });

      customerId = customer.id;

      await prisma.subscription.upsert({
        where: { userId: user.userId },
        update: {
          provider: 'stripe',
          providerCustomerId: customerId,
        },
        create: {
          userId: user.userId,
          plan: PlanTier.FREE,
          status: SubscriptionStatus.ACTIVE,
          provider: 'stripe',
          providerCustomerId: customerId,
        },
      });
    }

    const { successUrl, cancelUrl } = resolveStripeReturnUrls();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: user.userId,
        plan: requestedPlan,
        billingInterval,
      },
      subscription_data: {
        metadata: {
          userId: user.userId,
          plan: requestedPlan,
          billingInterval,
        },
        ...(existingSubscription?.providerSubscriptionId
          ? {}
          : { trial_period_days: NEW_USER_PRO_TRIAL_DAYS }),
      },
    });

    if (!session.url) {
      return badRequest('Stripe checkout session nie zwrócił URL.');
    }

    return NextResponse.json({
      success: true,
      mode: 'live',
      url: session.url,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (
      error instanceof Error &&
      (error.message.startsWith('Missing required config: STRIPE_') ||
        error.message.startsWith('Missing required config: BILLING_'))
    ) {
      return badRequest(error.message);
    }

    if (error && typeof error === 'object' && 'type' in error) {
      const stripeError = error as { type?: string; message?: string };
      if (stripeError.type?.startsWith('Stripe')) {
        return badRequest(stripeError.message || 'Stripe checkout error');
      }
    }

    return serverError(error);
  }
}
