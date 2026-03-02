import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { resolveBillingMode } from '@/lib/server/billing-mode';
import { prisma } from '@/lib/server/prisma';
import { getStripeClient } from '@/lib/server/stripe';

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

    const subscription = await prisma.subscription.findUnique({
      where: { userId: user.userId },
      select: { providerCustomerId: true },
    });

    if (!subscription?.providerCustomerId) {
      return badRequest('Brak customer ID Stripe dla użytkownika.');
    }

    const stripe = getStripeClient();

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.providerCustomerId,
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
