import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { getRecentSales, getRevenueSummary, isValidEmail, parseAmountToCents, recordSale } from '@/lib/server/monetization';

// Web equivalent of the Telegram /sale, /revenue commands.
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const [summary, sales] = await Promise.all([getRevenueSummary(user.userId), getRecentSales(user.userId, 20)]);
    return NextResponse.json({ summary, sales });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json().catch(() => ({}))) as { product?: string; amount?: string; fanEmail?: string };
    const product = body.product?.trim();
    const amountCents = body.amount ? parseAmountToCents(body.amount) : null;

    if (!product) {
      return badRequest('Validation failed', ['product: wymagana nazwa produktu']);
    }
    if (!amountCents) {
      return badRequest('Validation failed', ['amount: wymagana dodatnia kwota']);
    }
    if (body.fanEmail && !isValidEmail(body.fanEmail)) {
      return badRequest('Validation failed', ['fanEmail: nieprawidłowy adres email']);
    }

    const sale = await recordSale(user.userId, product, amountCents, { fanEmail: body.fanEmail });
    return NextResponse.json({ sale });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}
