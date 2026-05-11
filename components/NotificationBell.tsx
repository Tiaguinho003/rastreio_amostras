interface NotificationBellProps {
  className?: string;
}

// Placeholder visual nao-clicavel. Feature de notificacoes ainda nao
// implementada; este componente reserva o espaco visual e a affordance
// futura no header mobile. Quando a feature existir, transformar em
// botao com onClick, badge contador e drawer/modal de notificacoes.
export function NotificationBell({ className }: NotificationBellProps) {
  const classes = ['notification-bell', className].filter(Boolean).join(' ');
  return (
    <span className={classes} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </span>
  );
}
