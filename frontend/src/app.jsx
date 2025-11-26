
import { useState } from 'react';
import Splash from './components/Splash';
import Dashboard from './components/Dashboard';

function App() {
  const [showSplash, setShowSplash] = useState(true);
  if (showSplash) return <Splash onEnter={() => setShowSplash(false)} />;
  return <Dashboard />;
}

export default App;