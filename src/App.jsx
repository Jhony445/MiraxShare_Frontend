import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

const Landing = lazy(() => import('./pages/Landing.jsx'));
const Host = lazy(() => import('./pages/Host.jsx'));
const Join = lazy(() => import('./pages/Join.jsx'));
const AudioHost = lazy(() => import('./pages/AudioHost.jsx'));
const AudioJoin = lazy(() => import('./pages/AudioJoin.jsx'));

function App() {
  return (
    <Suspense
      fallback={
        <div className="mx-shell">
          <main className="mx-container flex min-h-screen items-center justify-center py-16">
            <div className="mx-panel px-6 py-4 text-sm text-white/68">Loading workspace...</div>
          </main>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host" element={<Host />} />
        <Route path="/join" element={<Join />} />
        <Route path="/audio/host" element={<AudioHost />} />
        <Route path="/audio/join" element={<AudioJoin />} />
      </Routes>
    </Suspense>
  );
}

export default App;
