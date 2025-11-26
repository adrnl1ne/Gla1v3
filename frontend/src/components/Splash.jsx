
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
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
      onClick={() => setEnter(true)}
    >
      <div
        style={{
          textAlign: 'center',
          transform: enter ? 'scale(10)' : hover ? 'scale(1.08)' : 'scale(1)',
          transition: 'all 1.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
          opacity: enter ? 0 : 1,
        }}
      >
        <img
          src={skull}
          alt="Gla1ve"
          style={{
            width: enter ? '800px' : hover ? '440px' : '400px',
            filter: enter
              ? 'hue-rotate(120deg) brightness(2)'
              : hover
              ? 'none'
              : 'grayscale(100%)',
            transition: 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
          }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        />
        <h1
          style={{
            fontFamily: '"Courier New", monospace',
            fontSize: '4rem',
            color: enter ? '#0f0' : hover ? '#0f0' : '#333',
            textShadow: enter || hover ? '0 0 20px #0f0' : 'none',
            letterSpacing: '0.3em',
            marginTop: '-50px',
            transition: 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
          }}
        >
          Gla1ve
        </h1>
      </div>
      {enter && <div style={{ position: 'fixed', inset: 0, background: '#000' }} />}
    </div>
  );
}

export default Splash;
