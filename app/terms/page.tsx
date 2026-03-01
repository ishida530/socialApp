import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | FlowState',
  description: 'Terms of service for FlowState social publishing app.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-6 text-sm text-muted-foreground">Effective date: March 1, 2026</p>

        <section className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            By using FlowState, you agree to use the platform in compliance with applicable laws
            and the policies of connected social networks.
          </p>
          <p>
            You are responsible for content you upload and publish through your linked accounts.
          </p>
          <p>
            The service may change over time and may be suspended for maintenance or security
            reasons.
          </p>
        </section>
      </div>
    </main>
  );
}
