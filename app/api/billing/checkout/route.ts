import { NextRequest, NextResponse } from 'next/server';
import { PlanTier, SubscriptionStatus } from '@prisma/client';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { setUserPlan } from '@/lib/server/subscription';
import { resolveBillingMode } from '@/lib/server/billing-mode';
import {
  getStripeClient,
  resolveStripePriceId,
  resolveStripeReturnUrls,
} from '@/lib/server/stripe';
import { prisma } from '@/lib/server/prisma';

function parseRequestedPlan(value?: string) {
  const plan = value?.toUpperCase();
  if (plan === 'PRO' || plan === 'PREMIUM') {
    return plan;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json()) as { plan?: string };
    const requestedPlan = parseRequestedPlan(body.plan);

    if (!requestedPlan) {
      return badRequest('Checkout wspiera plany PRO lub PREMIUM.');
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
        message: 'Plan został zaktualizowany lokalnie (mock checkout).',
        url: mockCheckoutUrl.toString(),
        subscription,
      });
    }

    const stripe = getStripeClient();
    const [stripePriceId, userRecord] = await Promise.all([
      resolveStripePriceId(requestedPlan),
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
      select: { providerCustomerId: true },
    });

    let customerId = existingSubscription?.providerCustomerId ?? null;
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
      },
      subscription_data: {
        metadata: {
          userId: user.userId,
          plan: requestedPlan,
        },
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

    return serverError(error);
  }
}
