import { describe, expect, it } from 'vitest';
import { findUnsupportedNumbers, type ExternalContentPayload } from '@/lib/server/external-content';

const listing: ExternalContentPayload = {
  type: 'LISTING',
  sourceRef: 'asari-1',
  title: 'Mieszkanie 3-pokojowe, 62 m², Olsztyn Jaroty',
  excerpt: 'Osobna kuchnia, balkon.',
  url: 'https://www.pryzmatnieruchomosci.pl/oferty/mieszkanie-1',
  imageUrl: 'https://img.example.com/1.jpg',
  price: 489000,
  location: 'Olsztyn',
};

describe('findUnsupportedNumbers', () => {
  it('accepts numbers taken from the data, formatted price and derived price per m²', () => {
    expect(findUnsupportedNumbers('3 pokoje, 62 m², 489 000 zł (ok. 7 887 zł/m²)', listing)).toEqual([]);
  });

  it('flags invented floor, area and rates', () => {
    expect(findUnsupportedNumbers('4. piętro, 70 m², podatek 19%', listing)).toEqual(['4', '70', '19']);
  });

  it('flags every number in a blog post announcement when the data has none', () => {
    const blog: ExternalContentPayload = { ...listing, type: 'BLOG_POST', title: 'Podatek od sprzedaży mieszkania', excerpt: 'Kiedy się płaci', price: undefined, url: 'https://x.pl/poradnik/a' };
    expect(findUnsupportedNumbers('Stawka to 19%, termin 5 lat', blog)).toEqual(['19', '5']);
  });
});
