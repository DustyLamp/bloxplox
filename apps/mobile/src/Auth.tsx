import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import type { AuthService } from '../../../packages/auth/src/index';
import { Button, ErrorText, Field, Logo, s, Txt, useWork } from './ui';
export function Auth({ auth, signedIn, initialError = '' }: { auth: AuthService; initialError?: string; signedIn(): Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'confirm' | 'forgot' | 'reset'>('login'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState(''), [message, setMessage] = useState('');
  const { busy, error, run } = useWork();
  const submit = () => void run(async () => {
    setMessage('');
    if (mode === 'login') {
      try { await auth.signIn(email, password); await signedIn(); }
      catch (error) { if (((error as { code?: string }).code ?? (error as Error).name) === 'UserNotConfirmedException') { setMode('confirm'); await auth.resend(email); setMessage('A verification code has been sent.'); } else throw error; }
    } else if (mode === 'signup') { try { await auth.signUp(email, password); setPassword(''); setMode('confirm'); setMessage('Check your email for a verification code.'); } catch (error) { if (((error as { code?: string }).code ?? (error as Error).name) !== 'UsernameExistsException') throw error; setPassword(''); setMode('login'); setMessage('An account already uses this email. Sign in, or use Forgot password to add an email password to a Google or Apple account.'); } }
    else if (mode === 'confirm') { await auth.confirm(email, code); setMode('login'); setMessage('Email verified. Sign in.'); }
    else if (mode === 'forgot') { await auth.forgot(email); setMode('reset'); setMessage('Check your email for a reset code.'); }
    else { await auth.reset(email, code, password); setMode('login'); setMessage('Password changed. Sign in.'); }
  });
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingTop: 70, maxWidth: 480, width: '100%', alignSelf: 'center' }]}><View style={s.row}><Logo/><Text style={s.title}>BloxPlox</Text></View><Text style={[s.h2, { marginVertical: 12 }]}>{({ login: 'Sign in', signup: 'Create account', confirm: 'Verify email', forgot: 'Reset password', reset: 'Choose a password' })[mode]}</Text>
    {['login', 'signup'].includes(mode) && auth.config.socialProviders?.map(provider => {
      const onPress = () => void run(async () => { const url = await auth.socialSignIn(provider, 'bloxplox://auth'); try { const result = await WebBrowser.openAuthSessionAsync(url, 'bloxplox://auth'); if (result.type === 'success') { await auth.finishSocialSignIn(result.url); await signedIn(); } } finally { auth.cancelSocialSignIn(url); } });
      return provider === 'SignInWithApple' ? <Pressable key={provider} accessibilityRole="button" accessibilityLabel="Continue with Apple" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onPress} style={{ minHeight: 44, backgroundColor: '#000', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: busy ? 0.5 : 1 }}><Image source={require('../../../packages/ui/assets/apple-sign-in.png')} style={{ width: 30, height: 30 }}/><Text style={{ fontSize: 17, fontWeight: '500', color: '#fff' }}>Continue with Apple</Text></Pressable> : <Button key={provider} disabled={busy} onPress={onPress}>Continue with Google</Button>;
    })}
    <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address"/>
    {['confirm', 'reset'].includes(mode) && <Field label="Verification code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code"/>}
    {['login', 'signup', 'reset'].includes(mode) && <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/>}
    {['signup', 'reset'].includes(mode) && <Txt small>At least 8 characters, including an uppercase letter and a number.</Txt>}
    <ErrorText message={error || initialError}/>{message && <Txt>{message}</Txt>}
    <Button primary disabled={busy || !email} onPress={submit}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'confirm' ? 'Verify email' : 'Continue'}</Button>
    {mode === 'confirm' && <Button disabled={busy} onPress={() => void run(async () => { await auth.resend(email); setMessage('A new code has been sent.'); })}>Resend code</Button>}
    {mode === 'login' ? <><Button onPress={() => setMode('signup')}>Create account</Button><Button onPress={() => setMode('forgot')}>Forgot password</Button></> : <Button onPress={() => setMode('login')}>Back to sign in</Button>}
    <Button onPress={() => void run(() => Linking.openURL('https://bloxplox.com/privacy'))}>Privacy</Button>
  </ScrollView></KeyboardAvoidingView>;
}
