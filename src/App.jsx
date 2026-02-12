import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import Host from './pages/Host.jsx';
import Join from './pages/Join.jsx';
import AudioHost from './pages/AudioHost.jsx';
import AudioJoin from './pages/AudioJoin.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/host" element={<Host />} />
      <Route path="/join" element={<Join />} />
      <Route path="/audio/host" element={<AudioHost />} />
      <Route path="/audio/join" element={<AudioJoin />} />
    </Routes>
  );
}

export default App;
