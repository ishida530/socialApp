import type { Metadata } from 'next';
import { LandingExperience } from '@/components/landing/LandingExperience';
import {
  LandingFaqSection,
  LandingFeaturesSection,
  LandingIntegrationsSection,
  LandingSeoSection,
} from '@/components/landing/LandingStaticSections';
import { LANDING_FAQ_ITEMS } from '@/lib/landing-faq';
import { getSiteUrl } from '@/lib/site-url';
import { isFreeBeta } from '@/lib/beta';

const siteUrl = getSiteUrl();

// SEO (2026-10-03, conversion/SEO review): one description reused across the structured data, no
// meta keywords (ignored by Google, and the old list advertised TikTok/YouTube scheduling that
// isn't live yet), no ratings or reviews we don't have.
const PRODUCT_DESCRIPTION =
  'Aplikacja do planowania i publikowania postów na Facebooku, Instagramie i LinkedIn z propozycjami opisów AI dla każdej platformy.';

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Postfly',
  url: siteUrl,
  logo: `${siteUrl}/icon.png`,
  areaServed: 'PL',
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    availableLanguage: ['pl'],
    url: `${siteUrl}/#contact`,
  },
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Postfly',
  url: siteUrl,
  inLanguage: 'pl-PL',
  description: PRODUCT_DESCRIPTION,
};

function monthlyOffer(name: string, price: string, intent: string) {
  return {
    '@type': 'Offer',
    name,
    price,
    priceCurrency: 'PLN',
    url: `${siteUrl}/register?source=landing&intent=${intent}`,
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price,
      priceCurrency: 'PLN',
      referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
    },
  };
}

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Postfly',
  url: siteUrl,
  inLanguage: 'pl',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'Social media scheduler',
  operatingSystem: 'Web',
  description: PRODUCT_DESCRIPTION,
  featureList: [
    'Propozycje opisów i hashtagów AI dla każdej platformy',
    'Planowanie i publikacja postów',
    'Harmonogram publikacji',
    'Rozwój kont i statystyki',
    'Bot Telegram',
  ],
  screenshot: [
    `${siteUrl}/landing/showcase/opis-ai-desktop.webp`,
    `${siteUrl}/landing/showcase/harmonogram-desktop.webp`,
    `${siteUrl}/landing/showcase/rozwoj-desktop.webp`,
  ],
  creator: { '@type': 'Organization', name: 'Code94', url: 'https://www.code94.pl' },
  // During the free beta (lib/beta.ts) nothing is for sale - only the free offer is listed.
  offers: [
    {
      '@type': 'Offer',
      name: isFreeBeta() ? 'Plan PRO bezpłatnie (okres startowy)' : 'Free',
      price: '0',
      priceCurrency: 'PLN',
      url: `${siteUrl}/register?source=landing&intent=free`,
    },
    ...(isFreeBeta()
      ? []
      : [monthlyOffer('Starter', '49', 'starter'), monthlyOffer('Pro', '129', 'pro'), monthlyOffer('Business', '299', 'business')]),
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
  title: 'Planowanie postów na Facebooka i Instagram z AI | Postfly',
  description:
    'Wrzuć zdjęcie i jedno zdanie – AI zaproponuje opisy i hashtagi na Facebooka, Instagram i LinkedIn. Edytujesz, planujesz, publikujesz. ' + (isFreeBeta() ? 'Teraz bezpłatnie, bez karty.' : '7 dni PRO bez karty.'),
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
    title: 'Postfly – planowanie postów z AI dla małych firm',
    description:
      'Jedno zdjęcie i jedno zdanie → osobne opisy na Facebooka, Instagram i LinkedIn. Ty zatwierdzasz, Postfly publikuje o czasie. TikTok i YouTube wkrótce.',
    url: '/',
    siteName: 'Postfly',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Postfly – planowanie postów na Facebooka, Instagram i LinkedIn',
      },
    ],
    locale: 'pl_PL',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Postfly – planowanie postów z AI dla małych firm',
    description:
      'Jedno zdjęcie i jedno zdanie → osobne opisy na Facebooka, Instagram i LinkedIn. Ty zatwierdzasz, Postfly publikuje o czasie.',
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
      <LandingExperience
        featuresSection={<LandingFeaturesSection />}
        seoSection={
          <>
            <LandingSeoSection />
            <LandingIntegrationsSection />
          </>
        }
        faqSection={<LandingFaqSection />}
      />
    </>
  );
}
