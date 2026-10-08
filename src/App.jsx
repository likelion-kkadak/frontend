import { useEffect, useRef } from 'react';
import prototypeMarkup from './prototype.html?raw';

/**
 * React mounts the product shell; the existing prototype's delegated UI logic
 * runs against that mounted DOM while its screens are migrated into components.
 */
export default function App() {
  const shellRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const loadScript = (src) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`화면 스크립트를 불러오지 못했습니다: ${src}`));
      document.body.appendChild(script);
    });

    loadScript('/js/data.js')
      .then(() => loadScript('/js/app.js'))
      .catch((error) => {
        if (!cancelled && shellRef.current) {
          shellRef.current.insertAdjacentHTML('beforeend', `<p class="prototype-error">${error.message}</p>`);
        }
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <div
      ref={shellRef}
      className="prototype-shell"
      dangerouslySetInnerHTML={{ __html: prototypeMarkup }}
    />
  );
}
