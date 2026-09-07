// Shared inline SVG icon set for the admin dashboard.
//
// These replace the emoji that used to sit in the tab bar, the students table
// and its row menus. Emoji render differently on every OS (and some platforms
// have no glyph at all for the ones that were in use), so they could not be
// sized, aligned or recoloured with the surrounding text — a 1.2em coloured
// picture in the middle of a label. Every icon here inherits currentColor and
// the size passed by its caller instead.
//
// All are 24×24 stroke icons so they stay optically consistent when mixed.

type IconProps = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function HomeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" /><path d="M9.5 21v-6h5v6" />
    </svg>
  );
}
export function FlaskIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 3h4" /><path d="M10 3v6.5L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.5V3" /><path d="M7 15h10" />
    </svg>
  );
}
export function UsersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M15.5 20v-1.5a3.5 3.5 0 0 0-3.5-3.5H7a3.5 3.5 0 0 0-3.5 3.5V20" /><circle cx="9.5" cy="8" r="3.5" />
      <path d="M20.5 20v-1.5a3.5 3.5 0 0 0-2.6-3.4" /><path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8" />
    </svg>
  );
}
export function ChatIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 15a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" />
    </svg>
  );
}
export function MegaphoneIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m3 11 14-6v14L3 13Z" /><path d="M3 11v2a2 2 0 0 0 2 2h1v4h3v-4" /><path d="M20 9.5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}
export function SettingsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
}
export function EyeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2.1 12.3a1 1 0 0 1 0-.6 10.7 10.7 0 0 1 19.8 0 1 1 0 0 1 0 .6 10.7 10.7 0 0 1-19.8 0" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}
export function DownloadIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 4v11" /><path d="m8 11 4 4 4-4" /><path d="M4 20h16" />
    </svg>
  );
}
export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
  );
}
export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}><path d="m6 9 6 6 6-6" /></svg>
  );
}
export function PencilIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" /><path d="M10 11v6" /><path d="M14 11v6" />
    </svg>
  );
}
export function MicroscopeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 18h12" /><path d="M9 18a5 5 0 0 0 8-4" /><path d="M9.5 3h3a1 1 0 0 1 1 1v7h-5V4a1 1 0 0 1 1-1Z" />
      <path d="M8 14h4" /><path d="M4 21h16" />
    </svg>
  );
}
export function UnlockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-2" />
    </svg>
  );
}
export function PauseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" /><path d="M10 9v6" /><path d="M14 9v6" />
    </svg>
  );
}
export function MoreIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" />
    </svg>
  );
}
export function TrendUpIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}><path d="m3 17 6-6 4 4 8-8" /><path d="M17 7h4v4" /></svg>
  );
}
export function TrendDownIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}><path d="m3 7 6 6 4-4 8 8" /><path d="M17 17h4v-4" /></svg>
  );
}
export function MinusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}><path d="M5 12h14" /></svg>
  );
}
export function ClockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
  );
}
export function PersonIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}
export function LogoutIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
    </svg>
  );
}
export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
