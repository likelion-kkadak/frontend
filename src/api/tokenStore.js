/**
 * accessToken 보관소.
 * 새로고침해도 로그인이 유지되도록 sessionStorage에 두고, 탭을 닫으면 사라진다.
 * (토큰 유효시간 15분, 만료 전 /auth/refresh로 교체 — API 명세 3.1)
 */
const STORAGE_KEY = 'kkadak.session';
const listeners = new Set();

let session = readStorage();

function readStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(value) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 메모리에만 유지
  }
}

export const tokenStore = {
  /** @returns {{accessToken: string, tokenType: string, expiresAt: string} | null} */
  get() {
    return session;
  },

  /** 만료되지 않은 accessToken만 돌려준다. */
  getAccessToken() {
    return session && !this.isExpired() ? session.accessToken : null;
  },

  isExpired(skewMs = 0) {
    if (!session?.expiresAt) return true;
    return Date.parse(session.expiresAt) - skewMs <= Date.now();
  },

  set({ accessToken, tokenType = 'Bearer', expiresAt }) {
    session = { accessToken, tokenType, expiresAt };
    writeStorage(session);
    listeners.forEach((fn) => fn(session));
  },

  clear() {
    if (!session) return;
    session = null;
    writeStorage(null);
    listeners.forEach((fn) => fn(null));
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
