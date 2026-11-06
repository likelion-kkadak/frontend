/** Access token은 메모리에만 보관하고 새로고침 시 HttpOnly 쿠키로 세션을 복원한다. */
const listeners = new Set();
let session = null;
try { sessionStorage.removeItem('kkadak.session'); } catch { /* 이전 버전 저장값 정리 */ }

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

  set({ accessToken, tokenType = 'Bearer', expiresAt, userId, user }) {
    session = { accessToken, tokenType, expiresAt, userId: userId ?? user?.id ?? session?.userId };
    listeners.forEach((fn) => fn(session));
  },

  clear() {
    if (!session) return;
    session = null;
    listeners.forEach((fn) => fn(null));
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
