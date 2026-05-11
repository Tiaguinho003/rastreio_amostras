import { redirect } from 'next/navigation';

// /settings foi absorvida em /profile (Fase 1 da refatoracao).
// Server Component faz o redirect server-side; tambem ha um redirect
// declarativo em next.config.mjs como fallback / belt-and-suspenders.
export const dynamic = 'force-dynamic';

export default function SettingsRedirect() {
  redirect('/profile');
}
