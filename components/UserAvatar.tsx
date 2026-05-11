import type { SessionUser } from '../lib/types';

export type UserAvatarSize = 'sm' | 'md' | 'lg';

interface UserAvatarProps {
  user: Pick<SessionUser, 'fullName' | 'username'>;
  size: UserAvatarSize;
  className?: string;
}

// Paleta determinística de 6 tons neutros (terra/petrol/musk) escolhidos
// para nao competir com o verde da marca. Contraste AA com texto branco
// verificado (>= 4.5:1).
const PALETTE = ['#5C6E58', '#6E5C58', '#58656E', '#6E6358', '#5E6E58', '#6B5E6E'] as const;

function buildInitials(fullName: string, username: string): string {
  const source = fullName.trim() || username.trim();
  if (!source) {
    return '?';
  }
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const first = parts[0][0] ?? '';
  const last = parts[parts.length - 1][0] ?? '';
  return `${first}${last}`.toUpperCase();
}

function buildColor(seed: string): string {
  const safe = seed.trim() || 'default';
  let sum = 0;
  for (const ch of safe) {
    sum += ch.charCodeAt(0);
  }
  return PALETTE[sum % PALETTE.length];
}

export function UserAvatar({ user, size, className }: UserAvatarProps) {
  const initials = buildInitials(user.fullName ?? '', user.username ?? '');
  const colorSeed = user.fullName?.trim() || user.username?.trim() || 'default';
  const backgroundColor = buildColor(colorSeed);
  const classes = ['user-avatar', `user-avatar--${size}`, className].filter(Boolean).join(' ');

  return (
    <span className={classes} style={{ backgroundColor }} aria-hidden="true">
      <span className="user-avatar__initials">{initials}</span>
    </span>
  );
}
