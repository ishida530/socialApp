import type { Metadata } from 'next';
import { LandingExperience } from '@/components/landing/LandingExperience';
import { LANDING_FAQ_ITEMS } from '@/lib/landing-faq';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Postfly',
  url: siteUrl,
  logo: `${siteUrl}/icon.png`,
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Postfly',
  url: siteUrl,
  inLanguage: 'pl-PL',
  description: 'Aplikacja SaaS do planowania i publikacji treści social media.',
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
      price: '49',
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
      price: '299',
      priceCurrency: 'PLN',
      url: `${siteUrl}/register?source=landing&intent=business`,
    },
  ],
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: LANDING_FAQ_ITEMS.map((faqItem) => ({
    '@type': 'Question',
    name: faqItem.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faqItem.answer,
    },
  })),
};

export const metadata: Metadata = {
  title: 'Postfly | Planowanie publikacji: YouTube, TikTok, Instagram, Facebook',
  description:
    'Planuj i publikuj treści na YouTube, TikTok, Instagram i Facebook z jednego panelu. Starter: do 3 kont i 15 wideo/mies., Pro: do 10 kont i limit miękki 100 wideo/mies. + AI Autopilot Lite, Business: do 25 kont i AI Autopilot bez limitu. Okres próbny 7 dni dla nowych kont i pierwszej subskrypcji.',
  keywords: [
    'planowanie publikacji social media',
    'harmonogram publikacji tiktok',
    'narzędzie do publikacji instagram reels',
    'social media scheduler polska',
    'automatyzacja publikacji youtube shorts',
    'panel do publikacji social media',
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
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
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Postfly - planowanie publikacji social media',
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
    images: ['/twitter-image'],
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <LandingExperience />
    </>
  );
}
