import * as lucide from 'lucide-react';

const toCheck = [
  'ShieldX', 'Mic2', 'MessageSquareQuote', 'Gamepad2', 'Code2',
  'ScanLine', 'Building2', 'Radio', 'Phone', 'Layout', 'Code',
  'Monitor', 'ExternalLink', 'MapPin', 'Calendar', 'ShieldOff'
];

toCheck.forEach(name => {
  console.log(`${name}: ${lucide[name] ? 'OK' : 'MISSING'}`);
});
