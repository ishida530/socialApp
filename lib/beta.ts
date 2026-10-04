// Free beta (2026-10-03): until the owner's business is active again, Postfly takes no payments -
// every account with a confirmed email gets the PRO plan for free, checkout is closed and the
// landing/billing copy talks about a free beta instead of trials and prices to pay.
//
// On by default. To start selling: set NEXT_PUBLIC_FREE_BETA=0 in Vercel and redeploy (it's a
// NEXT_PUBLIC_ variable, inlined at build time, so the client copy switches too).
export function isFreeBeta() {
  return process.env.NEXT_PUBLIC_FREE_BETA !== '0';
}

export const FREE_BETA_CHECKOUT_MESSAGE =
  'Postfly jest teraz bezpłatny - płatne plany uruchomimy później i nic nie zostanie pobrane automatycznie.';
