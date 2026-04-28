// ─── Canonical ticket types ─────────────────────────────────────────────────
export const TICKET_TYPES = [
  { id: 'organiser', label: 'Organiser / Staff',  color: 'text-purple-400',  bg: 'bg-purple-400/10', border: 'border-purple-400/20', bypass: true },
  { id: 'vip',       label: 'VIP Pass',            color: 'text-amber-400',   bg: 'bg-amber-400/10',  border: 'border-amber-400/20',  bypass: false },
  { id: 'speaker',   label: 'Speaker RSVP',        color: 'text-cyan-400',    bg: 'bg-cyan-400/10',   border: 'border-cyan-400/20',   bypass: false },
  { id: 'delegate',  label: 'General Delegate',    color: 'text-primary',     bg: 'bg-primary/10',    border: 'border-primary/20',    bypass: false },
  { id: 'workshop',  label: 'Workshop Pass',       color: 'text-green-400',   bg: 'bg-green-400/10',  border: 'border-green-400/20',  bypass: false },
  { id: 'exhibitor', label: 'Exhibitor',           color: 'text-orange-400',  bg: 'bg-orange-400/10', border: 'border-orange-400/20', bypass: false },
  { id: 'day-pass',  label: 'Day Pass',            color: 'text-zinc-400',    bg: 'bg-white/5',       border: 'border-white/10',      bypass: false },
  { id: 'visitor',   label: 'Visitor / Guest',     color: 'text-zinc-500',    bg: 'bg-white/5',       border: 'border-white/10',      bypass: false },
];

// ─── Seed zone rules ─────────────────────────────────────────────────────────
export const DEFAULT_ZONE_RULES = [
  { gateId: 'main-entrance', gateName: 'Main Entrance',   gateIcon: '\uD83D\uDEAA', allowedTickets: ['organiser','vip','speaker','delegate','workshop','exhibitor','day-pass','visitor'], timeWindow: { always: false, start: '08:00', end: '20:00' } },
  { gateId: 'hall-a',        gateName: 'Hall A',          gateIcon: '\uD83C\uDFDB️', allowedTickets: ['organiser','vip','speaker','delegate','day-pass'],                                 timeWindow: { always: false, start: '09:00', end: '18:00' } },
  { gateId: 'hall-b',        gateName: 'Hall B',          gateIcon: '\uD83C\uDFDB️', allowedTickets: ['organiser','vip','speaker','delegate','day-pass'],                                 timeWindow: { always: false, start: '09:00', end: '18:00' } },
  { gateId: 'vip-lounge',    gateName: 'VIP Lounge',      gateIcon: '\uD83D\uDC8E', allowedTickets: ['organiser','vip','speaker'],                                                         timeWindow: { always: false, start: '10:00', end: '22:00' } },
  { gateId: 'workshop-1',    gateName: 'Workshop Room 1', gateIcon: '\uD83D\uDCDA', allowedTickets: ['organiser','speaker','workshop'],                                                    timeWindow: { always: false, start: '09:00', end: '18:00' } },
  { gateId: 'workshop-2',    gateName: 'Workshop Room 2', gateIcon: '\uD83D\uDCDA', allowedTickets: ['organiser','speaker','workshop'],                                                    timeWindow: { always: false, start: '09:00', end: '18:00' } },
  { gateId: 'exhibition',    gateName: 'Exhibition Floor',gateIcon: '\uD83C\uDFAA', allowedTickets: ['organiser','vip','speaker','delegate','exhibitor','day-pass','visitor'],             timeWindow: { always: true } },
  { gateId: 'giveaway',      gateName: 'Giveaway Station',gateIcon: '\uD83C\uDF81', allowedTickets: ['organiser','vip','speaker','delegate','workshop','day-pass'],                        timeWindow: { always: false, start: '09:00', end: '19:00' } },
];

// ─── Utility: map ticket name → canonical ID ─────────────────────────────────
export const mapTicketToId = (ticketName = '') => {
  const n = ticketName.toLowerCase();
  if (n.includes('organis') || n.includes('staff') || n.includes('crew') || n.includes('admin')) return 'organiser';
  if (n.includes('vip'))       return 'vip';
  if (n.includes('speaker'))   return 'speaker';
  if (n.includes('workshop'))  return 'workshop';
  if (n.includes('exhibitor')) return 'exhibitor';
  if (n.includes('day'))       return 'day-pass';
  if (n.includes('visitor') || n.includes('guest')) return 'visitor';
  return 'delegate';
};

// ─── Core access check (exported for scanner) ────────────────────────────────
export const checkZoneAccess = (attendee, gateId, zoneRules) => {
  const rule = zoneRules.find(r => r.gateId === gateId);
  if (!rule) return { ok: false, reason: 'zone_denied' };

  const ticketId = mapTicketToId(attendee.ticketType);
  if (ticketId === 'organiser') return { ok: true };

  const allowed = rule.allowedTickets || [];
  if (!allowed.includes(ticketId)) return { ok: false, reason: 'zone_denied' };

  if (rule.timeWindow?.always) return { ok: true };
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = (rule.timeWindow?.start || '00:00').split(':').map(Number);
  const [eh, em] = (rule.timeWindow?.end || '23:59').split(':').map(Number);
  const start = sh * 60 + sm;
  const end   = eh * 60 + em;
  if (cur < start || cur > end) return { ok: false, reason: 'time_denied' };

  return { ok: true };
};
