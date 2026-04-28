'use client';

import type { CSSProperties } from 'react';

type UserItem = { id: string; fullName: string };

type Props = {
  users: UserItem[];
  /** Tamanho do avatar. sm = compacto (cards de listagem); md = detalhe. */
  size?: 'sm' | 'md';
  /** Quantos avatares aparecem antes de aglutinar em "+N". */
  maxVisible?: number;
};

const AVATAR_COLORS = [
  '#1f5d43',
  '#2f6b4a',
  '#173c30',
  '#0D47A1',
  '#1565C0',
  '#4E342E',
  '#5D4037',
  '#6D4C41',
  '#AD1457',
  '#C62828',
  '#6A1B9A',
  '#4527A0',
  '#00695C',
  '#00838F',
  '#E65100',
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getAvatarColor(name: string): string {
  return AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function UserAvatarStack({ users, size = 'sm', maxVisible = 3 }: Props) {
  if (!users.length) {
    return <span className="user-avatar-stack-empty">—</span>;
  }

  const visible = users.slice(0, maxVisible);
  const hidden = users.length - visible.length;
  const tooltip = users.map((u) => u.fullName).join(', ');

  return (
    <div
      className={`user-avatar-stack is-size-${size}`}
      title={tooltip}
      role="img"
      aria-label={`Responsáveis: ${tooltip}`}
    >
      {visible.map((user) => (
        <span
          key={user.id}
          className="user-avatar-stack__item"
          style={{ '--avatar-color': getAvatarColor(user.fullName) } as CSSProperties}
        >
          <span className="user-avatar-stack__initials">{getInitials(user.fullName)}</span>
        </span>
      ))}
      {hidden > 0 ? (
        <span className="user-avatar-stack__overflow" aria-label={`mais ${hidden}`}>
          +{hidden}
        </span>
      ) : null}
    </div>
  );
}
