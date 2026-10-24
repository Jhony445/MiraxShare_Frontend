import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';

const Landing = lazy(() => import('./pages/Landing.jsx'));
const Host = lazy(() => import('./pages/Host.jsx'));
const Join = lazy(() => import('./pages/Join.jsx'));
const AudioHost = lazy(() => import('./pages/AudioHost.jsx'));
const AudioJoin = lazy(() => import('./pages/AudioJoin.jsx'));

function App() {
  return (
    <Suspense fallback={null}>
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
