'use client';

import { useEffect, useState } from 'react';
import { FALLBACK_BILLING_CAPABILITIES, type BillingCapabilitiesResponse } from '@/lib/billing/capabilities';
import { fetchBillingCapabilities } from '@/lib/billing/capabilities-client';

export function useBillingCapabilities() {
  const [capabilities, setCapabilities] = useState<BillingCapabilitiesResponse>(FALLBACK_BILLING_CAPABILITIES);

  useEffect(() => {
    let isMounted = true;

    async function loadCapabilities() {
      const data = await fetchBillingCapabilities();
      if (isMounted) {
        setCapabilities(data);
      }
    }

    void loadCapabilities();

    return () => {
      isMounted = false;
    };
  }, []);

  return capabilities;
}
