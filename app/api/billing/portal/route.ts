import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { PlanTier, SubscriptionStatus } from '@prisma/client';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { resolveBillingMode } from '@/lib/server/billing-mode';
import { prisma } from '@/lib/server/prisma';
import { getStripeClient } from '@/lib/server/stripe';

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
    const billingMode = resolveBillingMode();
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    if (billingMode === 'mock') {
      const externalPortalUrl = process.env.BILLING_PORTAL_URL;
      const portalUrl = externalPortalUrl ?? `${frontendUrl}/billing?portal=mock`;

      return NextResponse.json({
        success: true,
        mode: 'mock',
        url: portalUrl,
        hasExternalPortal: Boolean(externalPortalUrl),
      });
    }

    const stripe = getStripeClient();
    const [subscription, userRecord] = await Promise.all([
      prisma.subscription.findUnique({
        where: { userId: user.userId },
        select: { providerCustomerId: true },
      }),
      prisma.user.findUnique({
        where: { id: user.userId },
        select: { id: true, email: true, name: true },
      }),
    ]);

    if (!userRecord) {
      return badRequest('Nie znaleziono użytkownika dla portalu rozliczeń.');
    }

    let customerId = subscription?.providerCustomerId ?? null;
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

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${frontendUrl}/billing`,
    });

    if (!session.url) {
      return badRequest('Stripe portal session nie zwrócił URL.');
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

    if (error instanceof Error && error.message.startsWith('Missing required config: STRIPE_')) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}
