import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_only_not_a_real_secret';

const constructEvent = vi.fn((body: string) => JSON.parse(body));
const sendPaymentFailedEmail = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/server/stripe', () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent },
  }),
}));

vi.mock('@/lib/mail/service', () => ({
  sendPaymentFailedEmail,
}));

const { POST } = await import('@/app/api/billing/webhook/stripe/route');
const { prisma } = await import('@/lib/server/prisma');
const { createTestUser, deleteTestUser } = await import('../helpers/fixtures');

const WEBHOOK_URL = 'http://localhost:3000/api/billing/webhook/stripe';

function stripeEventRequest(event: unknown) {
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'stripe-signature': 'test-signature' },
    body: JSON.stringify(event),
  });
}

function invoicePaymentFailedEvent(options: { customerId: string; subscriptionId?: string }) {
  return {
    id: `evt_${randomUUID()}`,
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: `in_${randomUUID()}`,
        customer: options.customerId,
        parent: options.subscriptionId
          ? {
              type: 'subscription_details',
              subscription_details: { subscription: options.subscriptionId },
            }
          : null,
      },
    },
  };
}

let cleanupUserId: string | null = null;

afterEach(async () => {
  constructEvent.mockClear();
  sendPaymentFailedEmail.mockClear();
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('POST /api/billing/webhook/stripe — invoice.payment_failed', () => {
  it('marks the subscription PAST_DUE when matched by providerSubscriptionId', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const customerId = `cus_${randomUUID()}`;
    const subscriptionId = `sub_${randomUUID()}`;

    await prisma.subscription.create({
      data: {
        userId: user.id,
        plan: 'PRO',
        status: 'ACTIVE',
        provider: 'stripe',
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
      },
    });

    const response = await POST(
      stripeEventRequest(invoicePaymentFailedEvent({ customerId, subscriptionId })),
    );

    expect(response.status).toBe(200);
    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(subscription?.status).toBe('PAST_DUE');
    expect(sendPaymentFailedEmail).toHaveBeenCalledWith(user.email, user.name);
  });

  it('falls back to matching by providerCustomerId when the invoice has no subscription reference', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const customerId = `cus_${randomUUID()}`;

    await prisma.subscription.create({
      data: {
        userId: user.id,
        plan: 'STARTER',
        status: 'ACTIVE',
        provider: 'stripe',
        providerCustomerId: customerId,
      },
    });

    const response = await POST(stripeEventRequest(invoicePaymentFailedEvent({ customerId })));

    expect(response.status).toBe(200);
    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(subscription?.status).toBe('PAST_DUE');
  });

  it('is idempotent: the same event.id is only processed once', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const customerId = `cus_${randomUUID()}`;
    const subscriptionId = `sub_${randomUUID()}`;

    await prisma.subscription.create({
      data: {
        userId: user.id,
        plan: 'PRO',
        status: 'ACTIVE',
        provider: 'stripe',
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
      },
    });

    const event = invoicePaymentFailedEvent({ customerId, subscriptionId });

    const first = await POST(stripeEventRequest(event));
    expect(first.status).toBe(200);

    // Manually resurrect the subscription to ACTIVE to prove a second delivery of the
    // same event.id is a no-op (idempotency table), not that the handler is just inert.
    await prisma.subscription.update({ where: { userId: user.id }, data: { status: 'ACTIVE' } });

    const second = await POST(stripeEventRequest(event));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.message).toBe('Event already processed');

    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(subscription?.status).toBe('ACTIVE');
    expect(sendPaymentFailedEmail).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/billing/webhook/stripe — subscription status mapping', () => {
  it('maps Stripe subscription statuses to internal SubscriptionStatus', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const customerId = `cus_${randomUUID()}`;
    const subscriptionId = `sub_${randomUUID()}`;

    const event = {
      id: `evt_${randomUUID()}`,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: subscriptionId,
          customer: customerId,
          status: 'past_due',
          cancel_at_period_end: false,
          metadata: { userId: user.id, plan: 'PRO' },
        },
      },
    };

    const response = await POST(stripeEventRequest(event));
    expect(response.status).toBe(200);

    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    expect(subscription?.status).toBe('PAST_DUE');
    expect(subscription?.plan).toBe('PRO');
  });
});
