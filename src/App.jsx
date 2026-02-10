import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import Host from './pages/Host.jsx';
import Join from './pages/Join.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/host" element={<Host />} />
      <Route path="/join" element={<Join />} />
    </Routes>
  );
}

export default App;
