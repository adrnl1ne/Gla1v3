
import { useEffect, useState } from 'react';
import skull from '../../assets/logo.png';

function Splash({ onEnter }) {
  const [enter, setEnter] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (enter) {
      const timer = setTimeout(() => {
        if (onEnter) onEnter();
      }, 1200); // match animation duration
      return () => clearTimeout(timer);
    }
  }, [enter, onEnter]);

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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transform: enter ? 'scale(10)' : hover ? 'scale(1.08)' : 'scale(1)',
          transition: 'all 1.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
          opacity: enter ? 0 : 1,
        }}
      >
        <h1
          style={{
            fontFamily: 'Fira Mono, "Courier New", monospace',
            fontSize: '5rem',
            color: enter ? '#0f0' : hover ? '#0f0' : '#222',
            textShadow: enter || hover ? '0 0 40px #0f0, 0 0 8px #fff' : '0 0 8px #111',
            letterSpacing: '0.35em',
            marginBottom: '0.2em',
            marginTop: 0,
            transition: 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
            userSelect: 'none',
            display: 'block',
            textAlign: 'center',
          }}
        >
          Gla1ve
        </h1>
        <img
          src={skull}
          alt="Gla1ve"
          style={{
            width: enter ? '900px' : hover ? '520px' : '480px',
            maxWidth: '90vw',
            filter: enter
              ? 'hue-rotate(120deg) brightness(2) drop-shadow(0 0 80px #0f0)'
              : hover
              ? 'drop-shadow(0 0 40px #0f0)'
              : 'grayscale(100%) drop-shadow(0 0 20px #222)',
            transition: 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
            cursor: 'pointer',
            borderRadius: '32px',
            border: hover ? '4px solid #0f0' : '4px solid #222',
            boxShadow: hover ? '0 0 60px #0f0' : '0 0 32px #111',
            display: 'block',
            margin: '0 auto',
          }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onClick={() => setEnter(true)}
        />
      </div>
      {enter && <div style={{ position: 'fixed', inset: 0, background: '#000' }} />}
    </div>
  );
}

export default Splash;
