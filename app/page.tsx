import type { Metadata } from 'next';
import { LandingExperience } from '@/components/landing/LandingExperience';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_ORIGIN ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Postfly',
  url: siteUrl,
  logo: `${siteUrl}/icon.png`,
};

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Postfly',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'Planowanie i publikacja treści na YouTube, TikTok, Instagram i Facebook z jednego panelu.',
  offers: [
    {
      '@type': 'Offer',
      name: 'Starter',
      price: '59',
      priceCurrency: 'PLN',
      url: `${siteUrl}/register?source=landing&intent=starter`,
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '129',
      priceCurrency: 'PLN',
      url: `${siteUrl}/register?source=landing&intent=pro`,
    },
    {
      '@type': 'Offer',
      name: 'Business',
      price: '279',
      priceCurrency: 'PLN',
      url: `${siteUrl}/register?source=landing&intent=business`,
    },
  ],
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Czy okres próbny trwa 7 dni dla każdego zakupu?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Nie. Okres próbny 7 dni dotyczy nowych kont i pierwszej subskrypcji.',
      },
    },
    {
      '@type': 'Question',
      name: 'Na jakich platformach mogę planować publikacje?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'W jednym panelu zaplanujesz i opublikujesz treści na YouTube, TikTok, Instagram i Facebook.',
      },
    },
    {
      '@type': 'Question',
      name: 'Czy plan Pro ma twardy limit publikacji?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Plan Pro nie ma twardego limitu publikacji, ale ma limit miękki 100 wideo miesięcznie.',
      },
    },
    {
      '@type': 'Question',
      name: 'W którym planie dostępny jest AI Autopilot?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'AI Autopilot Lite jest dostępny od planu Pro (limit miesięczny), a pełny AI Autopilot bez limitu w planie Business.',
      },
    },
  ],
};

export const metadata: Metadata = {
  title: 'Postfly | Planowanie publikacji: YouTube, TikTok, Instagram, Facebook',
  description:
    'Planuj i publikuj treści w 4 platformach: YouTube, TikTok, Instagram i Facebook. Starter: 15 wideo/mies., Pro: 100 wideo/mies. + AI Autopilot Lite (limit), Business: AI Autopilot bez limitu. Okres próbny 7 dni dla nowych kont.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Postfly | Planowanie publikacji social media',
    description:
      'Planuj i publikuj treści na YouTube, TikTok, Instagram i Facebook z jednego panelu.',
    url: '/',
    siteName: 'Postfly',
    images: [
      {
        url: '/icon.png',
        width: 512,
        height: 512,
        alt: 'Postfly',
      },
    ],
    locale: 'pl_PL',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Postfly | Planowanie publikacji social media',
    description:
      'Jeden panel do planowania i publikacji treści na YouTube, TikTok, Instagram i Facebook.',
    images: ['/icon.png'],
  },
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <LandingExperience />
    </>
  );
}
