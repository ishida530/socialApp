'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';

export type Features = {
  platformsInReview: string[];
  commentsEnabled: boolean;
};

// What the signed-in user can use right now (GET /api/features, prefetched by every authenticated
// layout, so this resolves from the seeded cache without a request). `null` until loaded - callers
// treat that as "not yet known" rather than guessing either way.
export function useFeatures(): Features | null {
  const [features, setFeatures] = useState<Features | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<Features>('/features')
      .then((response) => {
        if (!cancelled) {
          setFeatures(response.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFeatures({ platformsInReview: [], commentsEnabled: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return features;
}
