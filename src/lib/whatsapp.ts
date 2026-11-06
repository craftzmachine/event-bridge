// WhatsApp and email links with the message ready. They only open WhatsApp or the mail app:
// the planner reviews the message and presses Send there.

/** A WhatsApp number (country code + digits) from a typed contact, or null when it doesn't look like a phone number. */
export function waNumber(contact: string | undefined): string | null {
  const digits = (contact ?? "").replace(/[^\d+]/g, "");
  const plain = digits.replace(/^\+/, "").replace(/^00/, "");
  if (!/^\d{10,15}$/.test(plain)) return null;
  // a ten-digit Indian mobile number, typed without the country code
  if (plain.length === 10) return /^[6-9]/.test(plain) ? `91${plain}` : null;
  if (plain.length === 11 && plain.startsWith("0")) return /^0[6-9]/.test(plain) ? `91${plain.slice(1)}` : null;
  return plain;
}

/** wa.me with the text filled in; without a number, WhatsApp asks whom to send it to. */
export const waLink = (number: string | null, text: string) => `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`;

export const mailLink = (subject: string, body: string) => `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/** The two messages: the link first, the password in a separate message, as the share result advises. */
export function shareMessages(o: { client: string; company: string; title: string; link: string; password: string; expires: string }) {
  const name = o.client.trim() || "there";
  return {
    link: `Dear ${name}, your ${o.title} from ${o.company} is ready to view: ${o.link}\nIt's private: I'll send the password in a separate message. The link is active until ${o.expires}.`,
    password: `Password for your ${o.company} proposal: ${o.password}`,
    subject: `Your ${o.title} from ${o.company}`,
    email: `Dear ${name},\n\nYour ${o.title} is ready to view here:\n${o.link}\n\nIt's private, so I'll send you the password separately. The link is active until ${o.expires}.\n\nWarm regards,\n${o.company}`,
  };
}
