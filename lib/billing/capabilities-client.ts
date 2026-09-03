import {
  FALLBACK_BILLING_CAPABILITIES,
  isValidBillingCapabilities,
  type BillingCapabilitiesResponse,
} from '@/lib/billing/capabilities';

export async function fetchBillingCapabilities(): Promise<BillingCapabilitiesResponse> {
  try {
    const response = await fetch('/api/billing/capabilities', { method: 'GET', cache: 'no-store' });
    if (!response.ok) {
      return FALLBACK_BILLING_CAPABILITIES;
    }

    const data = await response.json();
    if (!isValidBillingCapabilities(data)) {
      return FALLBACK_BILLING_CAPABILITIES;
    }

    return data;
  } catch {
    return FALLBACK_BILLING_CAPABILITIES;
  }
}
