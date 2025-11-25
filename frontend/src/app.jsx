import { useState } from 'react';
import Splash from './components/Splash';
    


function App() {
  const [splashed, setSplashed] = useState(false);
  if (!splashed) return <Splash onEnter={() => setSplashed(true)} />;
  return <div>MAIN DASH COMING NEXT</div>;
}

export default App;