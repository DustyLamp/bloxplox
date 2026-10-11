import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRootRoute, createRoute, createRouter, Navigate, Outlet, RouterProvider } from '@tanstack/react-router';
import { loadConfig } from './commons/config';
import { AuthService } from './domain/auth';
import { DataProvider } from './commons/data';
import { Auth } from './ui/Auth';
import { App } from './ui/App';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <main className="loading"><h1>Could not open BloxPlox</h1><p>{this.state.error}</p><button onClick={() => location.reload()}>Reload</button></main> : this.props.children; }
}
const rootRoute = createRootRoute({ component: Outlet });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <Navigate to="/blocks"/> });
const appRoute = createRoute({ getParentRoute: () => rootRoute, path: '/$view', component: App });
const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, appRoute]) });

function Root() {
  const [auth, setAuth] = useState<AuthService>(), [identity, setIdentity] = useState<{ subject: string; email: string } | null>(), [error, setError] = useState('');
  useEffect(() => { void loadConfig().then(async config => { const service = new AuthService(config); setAuth(service); setIdentity(await service.identity()); }).catch(e => setError((e as Error).message)); }, []);
  const onSignOut = useCallback(() => setIdentity(null), []);
  if (error) return <main className="loading" role="alert">{error}<button onClick={() => location.reload()}>Reload</button></main>;
  if (!auth || identity === undefined) return <main className="loading" role="status">Opening BloxPlox…</main>;
  return <div id="bloxplox-v2">{identity ? <DataProvider key={identity.subject} auth={auth} identity={identity} onSignOut={onSignOut}><RouterProvider router={router}/></DataProvider> : <Auth auth={auth} onSignedIn={async () => setIdentity(await auth.identity())}/>}</div>;
}
createRoot(document.getElementById('app')!).render(<ErrorBoundary><Root/></ErrorBoundary>);
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}); });
