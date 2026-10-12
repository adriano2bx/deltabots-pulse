import { useState } from 'react';
import { client } from './lib/client';
import { Automations } from './pages/Automations';
import { Consents } from './pages/Consents';
import { Devices } from './pages/Devices';
import { Health } from './pages/Health';
import { Login } from './pages/Login';

const TABS = {
  health: { label: 'Saúde', view: Health },
  devices: { label: 'Dispositivos', view: Devices },
  automations: { label: 'Automações', view: Automations },
  consents: { label: 'Privacidade', view: Consents },
} as const;
type TabKey = keyof typeof TABS;

export function App() {
  const [signedIn, setSignedIn] = useState(client.signedIn);
  const [tab, setTab] = useState<TabKey>('health');
  if (!signedIn) return <Login onDone={() => setSignedIn(true)} />;
  const View = TABS[tab].view;
  return (
    <div className="shell">
      <header>
        <strong>DeltaBots Pulse</strong>
        <nav aria-label="Principal">
          {(Object.keys(TABS) as TabKey[]).map((k) => (
            <button key={k} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{TABS[k].label}</button>
          ))}
        </nav>
        <button onClick={() => void client.logout().finally(() => setSignedIn(false))}>Sair</button>
      </header>
      <main><View /></main>
    </div>
  );
}
