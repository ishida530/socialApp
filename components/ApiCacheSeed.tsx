'use client';

import { useState } from 'react';
import { seedApiCache } from '@/lib/api-client';

// Rendered by the section layout BEFORE the page: the seeding happens during this component's
// first render (useState initializer), i.e. before any effect of the page below it runs - so the
// page's mount-time apiClient.get calls already find the server-prefetched data. Browser only
// (seedApiCache ignores the server), so per-user data never lands in a shared server cache.
export function ApiCacheSeed({ entries }: { entries: Array<{ url: string; data: unknown }> }) {
  useState(() => {
    seedApiCache(entries);
    return true;
  });
  return null;
}
