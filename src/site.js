// Valorile folosite în șabloanele HTML, derivate din config/shop.json.

import { escapeHtml } from './template.js';
import { formatPrice } from './shared/money.js';
import { normalizePhone } from './shared/text.js';

export function buildSiteContext(shop, { publicUrl = '' } = {}) {
  const c = shop.contact;
  const base = publicUrl.replace(/\/+$/, '');
  const phoneIntl = normalizePhone(c.phone) ?? c.phone.replace(/\s+/g, '');
  const cakes = '/?categorie=torturi#produse';

  const hoursHtml = shop.hours
    .map((h) => `<div><dt>${escapeHtml(h.label)}</dt><dd>${escapeHtml(h.opens)} – ${escapeHtml(h.closes)}</dd></div>`)
    .join('');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Bakery',
    name: shop.name,
    description: shop.description,
    telephone: phoneIntl,
    email: c.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: c.address,
      addressLocality: c.city,
      postalCode: c.postalCode,
      addressCountry: 'RO',
    },
    openingHoursSpecification: shop.hours.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.days,
      opens: h.opens,
      closes: h.closes,
    })),
    ...(base ? { url: `${base}/`, image: `${base}/assets/img/og-image.png` } : {}),
  };

  // Adresele absolute (Open Graph) există doar dacă se știe adresa publică a site-ului.
  const socialMeta = base
    ? `<meta property="og:image" content="${escapeHtml(`${base}/assets/img/og-image.png`)}"><meta name="twitter:image" content="${escapeHtml(`${base}/assets/img/og-image.png`)}">`
    : '';

  return {
    year: new Date().getFullYear(),
    hoursHtml,
    socialMeta,
    // `<` este scris ca <, ca niciun text din configurare să nu poată închide eticheta <script>
    jsonLd: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
    shop: {
      name: shop.name,
      tagline: shop.tagline,
      description: shop.description,
      phone: c.phone,
      phoneHref: phoneIntl,
      email: c.email,
      address: c.address,
      city: c.city,
      postalCode: c.postalCode,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.address}, ${c.city}`)}`,
      deliveryFee: formatPrice(shop.delivery.fee, { compact: true }),
      freeFrom: formatPrice(shop.delivery.freeFrom, { compact: true }),
      minOrder: formatPrice(shop.delivery.minOrder, { compact: true }),
      deliveryArea: shop.delivery.area,
      payment: shop.payment,
      companyName: shop.legal.companyName,
      cui: shop.legal.cui,
      regCom: shop.legal.regCom,
      registeredOffice: shop.legal.registeredOffice,
      cakesUrl: cakes,
    },
  };
}
