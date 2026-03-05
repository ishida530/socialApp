"use client";

import { apiClient } from '@/lib/api-client';

type LandingEventPayload = {
  event: 'landing_view' | 'landing_section_view' | 'landing_cta_click' | 'landing_plan_click';
  source?: string;
  section?: string;
  cta?: string;
  plan?: string;
  href?: string;
};

export function trackLandingEvent(payload: LandingEventPayload) {
  void apiClient.post('/landing-events', payload).catch(() => {
    // Telemetry failures should never break conversion flow.
  });
}
