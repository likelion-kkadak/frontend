import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onUnauthorized } from '../api/client.js';
import { authApi } from '../api/endpoints.js';
import { ApiError, toApiError } from '../api/errors.js';
import { canManageGuild } from '../api/models.js';
import { tokenStore } from '../api/tokenStore.js';

/**
 * 로그인 세션 · 서버(guild) 선택 상태.
 * 흐름: authorize → Discord 이동 → (FE 콜백) login → me/guilds → 서버 선택 (API 명세 3.1)
 *
 * 사용: <AuthProvider><App /></AuthProvider> 후 컴포넌트에서 useAuth()
 */
const AuthContext = createContext(null);
const GUILD_KEY = 'kkadak.selectedGuildId';
const REFRESH_BEFORE_MS = 2 * 60 * 1000; // 만료 2분 전에 갱신
const REFRESH_RETRY_MS = 30 * 1000;

const readGuildId = () => {
  try {
    return localStorage.getItem(GUILD_KEY);
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  // checking: 저장된 토큰 확인 중 / authenticated / anonymous
  const [status, setStatus] = useState(() => (tokenStore.getAccessToken() ? 'checking' : 'anonymous'));
  const [user, setUser] = useState(null);
  const [guilds, setGuilds] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState(readGuildId);
  const [error, setError] = useState(null);
  const [expiresAt, setExpiresAt] = useState(() => tokenStore.get()?.expiresAt ?? null);
  const [refreshRetry, setRefreshRetry] = useState(0);

  const resetSession = useCallback((reason = null) => {
    tokenStore.clear();
    setUser(null);
    setGuilds([]);
    setExpiresAt(null);
    setError(reason);
    setStatus('anonymous');
  }, []);

  const loadGuilds = useCallback(async () => {
    const { guilds: list } = await authApi.guilds();
    setGuilds(list);
    // 저장된 선택이 목록에 없으면 첫 서버로 (접근 권한이 사라진 서버 데이터 노출 방지)
    setSelectedGuildId((current) => (list.some((g) => g.id === current) ? current : list[0]?.id ?? null));
    return list;
  }, []);

  // 새로고침 시 저장된 토큰으로 세션 복원
  useEffect(() => {
    if (status !== 'checking') return;
    let cancelled = false;
    Promise.all([authApi.me(), loadGuilds()])
      .then(([me]) => {
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      })
      .catch((err) => {
        if (!cancelled) resetSession(toApiError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [status, loadGuilds, resetSession]);

  // 어떤 API든 401을 받으면 로그아웃 상태로 전환
  useEffect(() => onUnauthorized((err) => resetSession(err)), [resetSession]);

  // 만료 전 자동 갱신 (이미 만료된 토큰은 갱신 불가 → 재로그인)
  useEffect(() => {
    if (status !== 'authenticated' || !expiresAt) return undefined;
    const delay = refreshRetry
      ? REFRESH_RETRY_MS
      : Math.max(Date.parse(expiresAt) - Date.now() - REFRESH_BEFORE_MS, 5000);
    const timer = setTimeout(async () => {
      try {
        const next = await authApi.refresh();
        tokenStore.set(next);
        setExpiresAt(next.expiresAt);
        setRefreshRetry(0);
        loadGuilds().catch(() => undefined); // 서버 목록 갱신 실패는 세션을 끊지 않음
      } catch (err) {
        const apiError = toApiError(err);
        // 네트워크 문제이고 토큰이 아직 유효하면 잠시 뒤 다시 시도
        if (apiError.isNetworkError && !tokenStore.isExpired()) setRefreshRetry((n) => n + 1);
        else resetSession(apiError);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [status, expiresAt, refreshRetry, loadGuilds, resetSession]);

  useEffect(() => {
    try {
      if (selectedGuildId) localStorage.setItem(GUILD_KEY, selectedGuildId);
      else localStorage.removeItem(GUILD_KEY);
    } catch {
      // 무시
    }
  }, [selectedGuildId]);

  /** "Discord로 시작하기" 버튼: 인증 URL을 받아 Discord로 이동 */
  const startLogin = useCallback(async () => {
    setError(null);
    try {
      const { url } = await authApi.authorize();
      window.location.assign(url);
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError);
      throw apiError;
    }
  }, []);

  /** FE 콜백 페이지에서 code/state로 로그인 완료 */
  const completeLogin = useCallback(
    async ({ code, state }) => {
      setError(null);
      setStatus('checking-callback');
      try {
        const result = await authApi.login({ code, state });
        tokenStore.set(result);
        setExpiresAt(result.expiresAt);
        setUser(result.user);
        await loadGuilds();
        setStatus('authenticated');
        return result.user;
      } catch (err) {
        // state는 일회성이라 실패하면 authorize부터 다시 시작해야 함
        resetSession(toApiError(err));
        throw toApiError(err);
      }
    },
    [loadGuilds, resetSession],
  );

  const logout = useCallback(async () => {
    try {
      if (tokenStore.getAccessToken()) await authApi.logout();
    } catch {
      // 서버 세션 삭제에 실패해도 FE 토큰·캐시는 지운다
    } finally {
      resetSession();
    }
  }, [resetSession]);

  const selectedGuild = guilds.find((g) => g.id === selectedGuildId) ?? null;

  const value = useMemo(
    () => ({
      status,
      isAuthenticated: status === 'authenticated',
      isChecking: status === 'checking' || status === 'checking-callback',
      user,
      guilds,
      selectedGuild,
      guildId: selectedGuild?.id ?? null,
      canManage: canManageGuild(selectedGuild),
      error,
      selectGuild: setSelectedGuildId,
      reloadGuilds: loadGuilds,
      startLogin,
      completeLogin,
      logout,
    }),
    [status, user, guilds, selectedGuild, error, loadGuilds, startLogin, completeLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 <AuthProvider> 안에서만 사용할 수 있습니다.');
  return ctx;
}

/**
 * Discord OAuth 콜백 페이지에서 사용. URL의 code/state를 읽어 한 번만 로그인 요청한다.
 * (OAuth code는 일회용이므로 중복 호출 방지)
 * @returns {{ status: 'idle'|'pending'|'success'|'error', error: import('../api/errors.js').ApiError|null }}
 */
export function useOAuthCallback({ onSuccess } = {}) {
  const { completeLogin } = useAuth();
  const [result, setResult] = useState({ status: 'idle', error: null });
  const startedRef = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    // 주소창에서 일회용 code 제거
    window.history.replaceState(null, '', window.location.pathname);

    if (params.get('error') || !code || !state) {
      setResult({
        status: 'error',
        error: new ApiError({
          status: 0,
          code: 'OAUTH_CANCELED',
          message: 'Discord 로그인이 완료되지 않았어요. 다시 시도해 주세요.',
        }),
      });
      return;
    }

    setResult({ status: 'pending', error: null });
    completeLogin({ code, state })
      .then((user) => {
        setResult({ status: 'success', error: null });
        onSuccessRef.current?.(user);
      })
      .catch((error) => setResult({ status: 'error', error }));
  }, [completeLogin]);

  return result;
}
