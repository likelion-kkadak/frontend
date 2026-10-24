import { useEffect, useRef, useState } from 'react';

/** 값이 delay 동안 바뀌지 않으면 callback 실행 (실시간 검색용) */
export function useDebouncedCallback(callback, delay) {
  const timerRef = useRef(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return (...args) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => callbackRef.current(...args), delay);
  };
}

/**
 * 해시 기반 화면 전환. 예) #/list?status=CONFIRMED, #/decision/DEC-1, #/search?q=왜
 * 새로고침·뒤로가기를 지원하고 서버 설정 없이 동작한다.
 */
export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '') || '/dashboard';
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return {
    page: parts[0] || 'dashboard',
    id: parts[1] ? decodeURIComponent(parts[1]) : null,
    params: Object.fromEntries(new URLSearchParams(qs)),
  };
}

export function buildHash(path, params) {
  const qs = params
    ? new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      ).toString()
    : '';
  return `#${path}${qs ? `?${qs}` : ''}`;
}

/**
 * @param {{ replace?: boolean }} [options] replace: 뒤로가기 기록을 남기지 않음 (입력 중 실시간 검색 등)
 */
export function navigate(path, params, { replace = false } = {}) {
  const next = buildHash(path, params);
  if (window.location.hash === next) return;
  if (replace) {
    window.history.replaceState(null, '', next);
    window.dispatchEvent(new window.Event('hashchange'));
  } else {
    window.location.hash = next;
  }
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash());
      window.scrollTo?.(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
