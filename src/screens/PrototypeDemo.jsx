import { useEffect, useRef } from 'react';
import prototypeMarkup from '../prototype.html?raw';

/**
 * "데모 바로 보기" (/?demo) — 팀원이 만든 샘플 데이터 프로토타입을 그대로 보여준다.
 * 실제 API는 호출하지 않는다.
 */
export default function PrototypeDemo() {
  const shellRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`화면 스크립트를 불러오지 못했습니다: ${src}`));
        document.body.appendChild(script);
      });

    loadScript('/js/data.js')
      .then(() => loadScript('/js/app.js'))
      .then(() => {
        // 랜딩을 건너뛰고 데모 대시보드부터 보여준다
        if (!cancelled) document.querySelector('#landing [data-action="dashboard"]')?.click();
      })
      .catch((error) => {
        if (!cancelled && shellRef.current) {
          const p = document.createElement('p');
          p.className = 'prototype-error';
          p.textContent = error.message;
          shellRef.current.appendChild(p);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <a className="demo-banner" href="/">
        데모 모드 (샘플 데이터) · 실제 서비스로 이동 →
      </a>
      <div ref={shellRef} className="prototype-shell" dangerouslySetInnerHTML={{ __html: prototypeMarkup }} />
    </>
  );
}
