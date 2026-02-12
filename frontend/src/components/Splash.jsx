
import { useEffect, useState } from 'react';
import skull from '../../assets/newLogo.png';

function Splash({ onEnter }) {
  const [enter, setEnter] = useState(false);
  const [hover, setHover] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  // Preload image
  useEffect(() => {
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.onerror = () => {
      console.error('Failed to load splash image');
      setImageFailed(true);
      // Auto-skip splash on image load failure
      setTimeout(() => onEnter?.(), 100);
    };
    img.src = skull;
  }, [onEnter]);

  useEffect(() => {
    if (enter && imageLoaded) {
      const timer = setTimeout(() => {
        if (onEnter) onEnter();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [enter, imageLoaded, onEnter]);

  // Don't render anything if image failed to load
  if (imageFailed) {
    return null;
  }

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        background: 'radial-gradient(ellipse at center, #181818 0%, #000 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        margin: 0,
        padding: 0,
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 1000,
        boxSizing: 'border-box',
      }}
    >
      {!imageLoaded && (
        <div style={{
          color: '#8b949e',
          fontSize: '1.2rem',
          animation: 'pulse 1.5s ease-in-out infinite'
        }}>
          Loading...
        </div>
      )}
      {imageLoaded && (
        <div
          style={{
            transform: enter ? 'scale(10)' : hover ? 'scale(1.08)' : 'scale(1)',
            transition: 'all 1.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
            opacity: enter ? 0 : 1,
            cursor: 'pointer',
          }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onClick={() => setEnter(true)}
        >
          <img
            src={skull}
            alt="Gla1ve"
            style={{
              width: enter ? `${Math.min(window.innerWidth * 0.45, 1100)}px` : 
                     hover ? `${Math.min(window.innerWidth * 0.35, 800)}px` : 
                     `${Math.min(window.innerWidth * 0.28, 650)}px`,
              height: enter ? `${Math.min(window.innerHeight * 0.45, 1100)}px` : 
                      hover ? `${Math.min(window.innerHeight * 0.35, 800)}px` : 
                      `${Math.min(window.innerHeight * 0.28, 650)}px`,
              maxWidth: '85vw',
              maxHeight: '85vh',
              objectFit: 'contain',
              filter: hover || enter ? 'drop-shadow(0 0 40px #0f0)' : 'drop-shadow(0 0 20px #222)',
              transition: 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
              display: 'block',
            }}
          />
        </div>
      )}
      {enter && <div style={{ position: 'fixed', inset: 0, background: '#000' }} />}
    </div>
  );
}

export default Splash;

