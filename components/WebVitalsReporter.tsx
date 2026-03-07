"use client";

import { useReportWebVitals } from 'next/web-vitals';

type WebVitalMetric = {
  id: string;
  name: string;
  label: 'web-vital' | 'custom';
  value: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
  navigationType?: string;
};

export function WebVitalsReporter() {
  const isReportingEnabled = process.env.NEXT_PUBLIC_ENABLE_WEB_VITALS === 'true';

  useReportWebVitals((metric: WebVitalMetric) => {
    if (!isReportingEnabled) {
      return;
    }

    // Sample only half of visits to keep endpoint overhead low.
    if (Math.random() > 0.5) {
      return;
    }

    const payload = {
      id: metric.id,
      name: metric.name,
      value: Number(metric.value.toFixed(2)),
      label: metric.label,
      rating: metric.rating,
      navigationType: metric.navigationType,
      path: window.location.pathname,
      at: new Date().toISOString(),
    };

    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/web-vitals', blob);
      return;
    }

    void fetch('/api/web-vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  });

  if (!isReportingEnabled) {
    return null;
  }

  return null;
}
