import { useState, type FormEvent } from 'react';
import type { AuthService } from '../domain/auth';
import { Button, ErrorText, Field, Logo } from './components/common';

export function Auth({ auth, onSignedIn, initialError = '' }: { auth: AuthService; initialError?: string; onSignedIn: () => Promise<void> }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'verify' | 'forgot' | 'reset'>('signin');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState('');
  const [error, setError] = useState(initialError), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const title = { signin: 'Sign in', signup: 'Create an account', verify: 'Verify your email', forgot: 'Reset password', reset: 'Choose a new password' }[mode];
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'signin') { await auth.signIn(email, password); await onSignedIn(); }
      if (mode === 'signup') { await auth.signUp(email, password); setPassword(''); setMode('verify'); }
      if (mode === 'verify') { await auth.confirm(email, code); setCode(''); setMode('signin'); setNotice('Email verified. Sign in to continue.'); }
      if (mode === 'forgot') { await auth.forgot(email); setMode('reset'); }
      if (mode === 'reset') { await auth.reset(email, code, password); setCode(''); setPassword(''); setMode('signin'); setNotice('Password updated.'); }
    } catch (err) {
      if (err instanceof Error && err.name === 'UserNotConfirmedException') { setMode('verify'); setNotice('Enter the code sent to your email.'); }
      else if (err instanceof Error && err.name === 'UsernameExistsException') { setMode('signin'); setPassword(''); setNotice('An account already uses this email. Sign in, or use Forgot password to add an email password to a Google or Apple account.'); }
      else setError(err instanceof Error ? err.message : 'Could not continue. Try again.');
    } finally { setBusy(false); }
  }
  return <main className="auth-shell"><Logo/><section className="auth-card"><h1>{title}</h1>
    {['signin', 'signup'].includes(mode) && auth.config.socialProviders?.map(provider => <Button key={provider} className="bp2-full auth-social" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { window.location.assign(await auth.socialSignIn(provider, `${location.origin}/auth/callback`)); } catch (e) { setError((e as Error).message); setBusy(false); } }}>Continue with {provider === 'Google' ? 'Google' : 'Apple'}</Button>)}
    <form onSubmit={submit}>
      <Field label="Email"><input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></Field>
      {['signin', 'signup', 'reset'].includes(mode) && <Field label="Password"><input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={mode === 'signin' ? 1 : 8} value={password} onChange={e => setPassword(e.target.value)}/></Field>}
      {['verify', 'reset'].includes(mode) && <Field label="Verification code"><input autoComplete="one-time-code" inputMode="numeric" required value={code} onChange={e => setCode(e.target.value)}/></Field>}
      {['signup', 'reset'].includes(mode) && <p className="bp2-muted">Use at least 8 characters, including one uppercase letter and one number.</p>}
      <ErrorText message={error}/>{notice && <p role="status" className="auth-notice">{notice}</p>}
      <Button type="submit" primary disabled={busy} className="bp2-full">{busy ? 'Please wait…' : title}</Button>
    </form>
    <div className="auth-links">
      {mode === 'signin' && <><Button onClick={() => { setMode('forgot'); setError(''); }}>Forgot password</Button>{auth.config.publicSignup && <Button onClick={() => { setMode('signup'); setError(''); }}>Create an account</Button>}</>}
      {mode !== 'signin' && <Button onClick={() => { setMode('signin'); setError(''); }}>Back to sign in</Button>}
      {mode === 'verify' && <Button disabled={busy} onClick={async () => { setBusy(true); try { await auth.resend(email); setNotice('A new code has been sent.'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Resend code</Button>}
    </div>
  </section></main>;
}
