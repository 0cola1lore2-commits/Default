// Notificare opțională la comenzi noi, printr-un webhook (Slack, Mattermost, Discord, Teams...).
// Trimitem puțin: număr, total, dată și prenume. Telefonul și adresa rămân doar în panoul de administrare.

import { formatPrice } from './shared/money.js';
import { formatDateShort } from './shared/format.js';
import { slotLabel } from './shared/schedule.js';

export function parseWebhookUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('NOTIFY_WEBHOOK_URL nu este o adresă validă.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('NOTIFY_WEBHOOK_URL trebuie să înceapă cu https://');
  return url.toString();
}

export function createNotifier({ webhookUrl, publicUrl = '', logger = console, fetchImpl = globalThis.fetch }) {
  if (!webhookUrl) return { enabled: false, async notifyNewOrder() {} };

  return {
    enabled: true,
    /** Nu aruncă niciodată: o notificare eșuată nu trebuie să strice comanda. */
    async notifyNewOrder(order) {
      const how = order.fulfilment.method === 'delivery' ? 'livrare' : 'ridicare';
      const firstName = order.customer.name.split(' ')[0];
      const link = publicUrl ? `\n${publicUrl.replace(/\/$/, '')}/admin` : '';
      const text = `🧁 Comandă nouă ${order.number} · ${formatPrice(order.totals.total)} · ${how} ${formatDateShort(order.fulfilment.date)}, ${slotLabel(order.fulfilment.slot)} · ${firstName}${link}`;
      try {
        const res = await fetchImpl(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // „text” pentru Slack/Mattermost/Teams, „content” pentru Discord
          body: JSON.stringify({ text, content: text }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) logger.warn(`Notificarea pentru ${order.number} a eșuat: HTTP ${res.status}`);
      } catch (err) {
        logger.warn(`Notificarea pentru ${order.number} a eșuat: ${err.message}`);
      }
    },
  };
}
