import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { getDb } from './lib/db';

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  try {
    await getDb();
    root.render(<StrictMode><App/></StrictMode>);
  } catch (error) {
    root.render(<div style={{fontFamily:'system-ui',padding:40,maxWidth:720}}><h2>Finance Tracker could not start</h2><p>The local SQLite database did not initialize.</p><pre style={{whiteSpace:'pre-wrap'}}>{String(error)}</pre><p>Start the app with <code>npm run tauri:dev</code>, not the plain Vite browser server.</p></div>);
  }
}
boot();
