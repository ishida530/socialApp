import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | FlowState',
  description: 'Privacy policy for FlowState social publishing app.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-6 text-sm text-muted-foreground">
          Effective date: March 1, 2026
        </p>

        <section className="mt-8 space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            FlowState collects account information and connected social account tokens only to
            provide video publishing features.
          </p>
          <p>
            We use this data to authenticate users, schedule posts, and maintain account security.
            We do not sell personal data.
          </p>
          <p>
            If you want your data deleted, contact the app owner and include the email used for
            your account.
          </p>
        </section>
      </div>
    </main>
  );
}
