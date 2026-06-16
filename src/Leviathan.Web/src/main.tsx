import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type AppManifest = { id: string; title: string; description: string; capabilities: string[] };
type Choice = { key: string; text: string };
type Prompt = { id: string; kind: 'line' | 'choice' | 'text-input'; text: string | null; choices: Choice[] };
type Screen = { sessionId: string; title: string; revision: number; isComplete: boolean; error: string | null; transcript: { id: string; text: string; speaker: string | null }[]; prompt: Prompt | null };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function Apps() {
  const [apps, setApps] = useState<AppManifest[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<AppManifest[]>('/api/apps').then(setApps).catch(e => setError(String(e))); }, []);
  return <main><h1>Leviathan Apps</h1>{error && <p className="error">{error}</p>}{apps.map(app => <a className="card" href="/apps/rust-simulator" key={app.id}><h2>{app.title}</h2><p>{app.description}</p><small>{app.capabilities.join(', ')}</small></a>)}</main>;
}

function RustSimulator() {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ sessionId: string; screen: Screen }>('/api/ariadne/sessions', { method: 'POST', body: JSON.stringify({ appId: 'rust_simulator' }) }).then(r => setScreen(r.screen)).catch(e => setError(String(e))); }, []);
  const submit = async (path: string, body: object) => { if (!screen) return; setError(null); try { setScreen(await api<Screen>(`/api/ariadne/sessions/${screen.sessionId}/${path}`, { method: 'POST', body: JSON.stringify(body) })); } catch (e) { setError(String(e)); } };
  if (!screen) return <main><h1>Rust Simulator</h1><p>Starting session…</p>{error && <p className="error">{error}</p>}</main>;
  const prompt = screen.prompt;
  return <main><a href="/apps">← Apps</a><h1>{screen.title}</h1><section className="transcript">{screen.transcript.map(line => <p key={line.id}>{line.speaker && <strong>{line.speaker}: </strong>}{line.text}</p>)}</section>{prompt && <section className="prompt"><h2>{prompt.text ?? 'Continue'}</h2>{prompt.kind === 'line' && <button onClick={() => submit('advance', { promptId: prompt.id, revision: screen.revision })}>Advance</button>}{prompt.kind === 'choice' && prompt.choices.map(choice => <button key={choice.key} onClick={() => submit('choose', { promptId: prompt.id, revision: screen.revision, choiceKey: choice.key })}>{choice.text}</button>)}{prompt.kind === 'text-input' && <form onSubmit={e => { e.preventDefault(); submit('input', { promptId: prompt.id, revision: screen.revision, text }); setText(''); }}><input value={text} onChange={e => setText(e.target.value)} /><button>Submit</button></form>}</section>}{screen.isComplete && <p className="complete">Adventure complete.</p>}{screen.error && <p className="error">{screen.error}</p>}{error && <p className="error">{error}</p>}<pre>session={screen.sessionId}\nrevision={screen.revision}\nprompt={prompt?.id ?? 'none'} kind={prompt?.kind ?? 'none'}</pre></main>;
}

function App() { return location.pathname.startsWith('/apps/rust-simulator') ? <RustSimulator /> : <Apps />; }

createRoot(document.getElementById('root')!).render(<App />);
