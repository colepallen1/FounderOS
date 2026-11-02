import { redirect } from 'next/navigation';
import { Icon, Mark } from '@/components/Icon';
import { appPassword, appSecret, authDisabled } from '@/lib/config';

export const metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  wrong: 'That password is not right.',
  locked: 'Too many attempts. Wait five minutes and try again.',
  config: 'CELO_PASSWORD and CELO_SECRET must be set on the server before anyone can sign in.',
};

export default function Login({ searchParams }: { searchParams: { error?: string; next?: string } }) {
  if (authDisabled()) redirect('/');
  const misconfigured = !appPassword() || !appSecret();
  const error = misconfigured ? ERRORS.config : searchParams.error ? ERRORS[searchParams.error] : null;
  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center text-center">
          <Mark size={56} />
          <div className="display mt-6 text-[34px] leading-none tracking-[0.3em] text-ink">CELO</div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.6em] text-accent">Digital</div>
          <div className="rule mt-8 w-full" />
        </div>
        <form action="/api/auth/login" method="post" className="panel space-y-5 p-7">
          <input type="hidden" name="next" value={searchParams.next ?? '/'} />
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus className="field" disabled={misconfigured} />
          </div>
          {error && (
            <p className="flex items-start gap-2 text-[13px] text-bad">
              <Icon name="alert" size={15} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}
          <button className="btn w-full justify-center py-2.5" disabled={misconfigured}>
            <Icon name="lock" size={14} /> Enter
          </button>
        </form>
        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.3em] text-faint">Private. Authorized access only.</p>
      </div>
    </div>
  );
}
