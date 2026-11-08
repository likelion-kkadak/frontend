import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { invalidateAuthScope, invalidateRequestScope, onGuildAccessChanged, onUnauthorized, setWorkspaceRequestsBlocked } from '../api/client.js';
import { authApi } from '../api/endpoints.js';
import { ApiError, toApiError } from '../api/errors.js';
import { canManageGuild } from '../api/models.js';
import { tokenStore } from '../api/tokenStore.js';

const AuthContext = createContext(null);
const REFRESH_BEFORE_MS = 2 * 60 * 1000;
const selectionKey = (user) => `kkadak.selectedGuildId.${user.id ?? user.discordUserId}`;
const savedSelection = (user) => {
  try { return localStorage.getItem(selectionKey(user)); } catch { return null; }
};

/** URL에 실제 OAuth 콜백 정보가 있는지 확인한다. 불완전한 state만으로 복원을 생략하지 않는다. */
export const hasOAuthParams = () => {
  const params = new URLSearchParams(window.location.search);
  return params.has('state') && (params.has('code') || params.has('error'));
};

export function AuthProvider({ children }) {
  const callbackAtMount = useRef(hasOAuthParams());
  const [status, setStatus] = useState('checking');
  const [user, setUser] = useState(null);
  const [guilds, setGuilds] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState(null);
  const [guildSelection, setGuildSelection] = useState({ status: 'unavailable', checkedAt: null });
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [scopeKey, setScopeKey] = useState(0);
  const [error, setError] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [refreshRetry, setRefreshRetry] = useState(0);
  const generation = useRef(0);
  const currentUser = useRef(null);
  const pendingGuilds = useRef(null);
  const guildController = useRef(null);
  const preferredGuild = useRef(null);

  const clearScope = useCallback((authenticationChanged = false) => {
    if (authenticationChanged) invalidateAuthScope();
    else invalidateRequestScope();
    setScopeKey((n) => n + 1);
  }, []);

  const resetSession = useCallback((reason = null) => {
    generation.current++;
    guildController.current?.abort();
    pendingGuilds.current = null;
    currentUser.current = null;
    preferredGuild.current = null;
    setWorkspaceRequestsBlocked(true);
    clearScope(true);
    tokenStore.clear();
    setUser(null); setGuilds([]); setSelectedGuildId(null);
    setGuildSelection({ status: 'unavailable', checkedAt: null });
    setIsRevalidating(false); setExpiresAt(null); setError(reason); setStatus('anonymous');
  }, [clearScope]);

  const applyGuilds = useCallback((result, account, restore = false) => {
    const selection = result.guildSelection ?? { status: 'ready', checkedAt: null };
    const list = selection.status === 'ready' && Array.isArray(result.guilds) ? result.guilds : [];
    setGuildSelection(selection);
    setGuilds(list);
    if (selection.status === 'ready') {
      const preferred = restore ? savedSelection(account) : preferredGuild.current;
      const next = list.some((g) => g.id === preferred) ? preferred : list[0]?.id ?? null;
      if (next !== preferredGuild.current) clearScope();
      preferredGuild.current = next;
      setSelectedGuildId(next);
    }
    setWorkspaceRequestsBlocked(selection.status !== 'ready');
    setError(null);
  }, [clearScope]);

  const restoreSession = useCallback(async () => {
    const epoch = ++generation.current;
    guildController.current?.abort(); pendingGuilds.current = null;
    invalidateAuthScope(); setWorkspaceRequestsBlocked(true);
    setIsRevalidating(false); setStatus('checking'); setGuilds([]); setUser(null);
    try {
      const result = await authApi.session();
      if (epoch !== generation.current) return;
      if (currentUser.current?.id !== result.user.id) clearScope();
      currentUser.current = result.user;
      tokenStore.set(result); setExpiresAt(result.expiresAt); setUser(result.user);
      applyGuilds(result, result.user, true); setIsRevalidating(false); setStatus('authenticated');
    } catch (err) {
      if (epoch !== generation.current) return;
      const failure = toApiError(err);
      if (failure.status === 401) resetSession(failure);
      else { setError(failure); setStatus('session-error'); }
    }
  }, [applyGuilds, clearScope, resetSession]);

  const loadGuilds = useCallback(() => {
    if (pendingGuilds.current) return pendingGuilds.current;
    const account = currentUser.current;
    if (!account) return Promise.resolve([]);
    const epoch = generation.current;
    const controller = new AbortController();
    guildController.current = controller;
    invalidateRequestScope(); setWorkspaceRequestsBlocked(true); setIsRevalidating(true);
    const task = authApi.guilds({ signal: controller.signal }).then((result) => {
      if (epoch !== generation.current || controller.signal.aborted) return [];
      applyGuilds(result, account);
      return result.guilds;
    }).catch((err) => {
      if (epoch !== generation.current || controller.signal.aborted) return [];
      setGuilds([]);
      setGuildSelection({ status: 'unavailable', checkedAt: null });
      setError(toApiError(err));
      throw err;
    }).finally(() => {
      if (pendingGuilds.current === task) pendingGuilds.current = null;
      if (epoch === generation.current) setIsRevalidating(false);
    });
    pendingGuilds.current = task;
    return task;
  }, [applyGuilds]);

  useEffect(() => {
    // OAuth 콜백은 login 응답의 검증된 목록을 그대로 사용한다.
    if (callbackAtMount.current) return undefined;
    restoreSession();
    return () => { generation.current++; guildController.current?.abort(); };
  }, [restoreSession]);

  useEffect(() => onUnauthorized(() => { restoreSession(); }), [restoreSession]);
  useEffect(() => tokenStore.subscribe(session => {
    setExpiresAt(session?.expiresAt ?? null);
    if (session) setRefreshRetry(0);
  }), []);
  useEffect(() => onGuildAccessChanged(() => { loadGuilds().catch(() => undefined); }), [loadGuilds]);
  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    const refresh = () => { if (document.visibilityState !== 'hidden') loadGuilds().catch(() => undefined); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, [status, loadGuilds]);

  // JWT 갱신은 서버 목록 조회와 분리한다. 설치 목록의 주기적 폴링은 하지 않는다.
  useEffect(() => {
    if (status !== 'authenticated' || !expiresAt) return undefined;
    const epoch = generation.current;
    const timer = setTimeout(async () => {
      try {
        await authApi.token();
        if (epoch !== generation.current) return;
        setRefreshRetry(0);
      } catch (err) {
        if (epoch !== generation.current) return;
        const failure = toApiError(err);
        if (!failure.isCanceled) setRefreshRetry((n) => n + 1);
      }
    }, refreshRetry ? 30000 : Math.max(Date.parse(expiresAt) - Date.now() - REFRESH_BEFORE_MS, 5000));
    return () => clearTimeout(timer);
  }, [status, expiresAt, refreshRetry]);

  useEffect(() => {
    if (!user || isRevalidating || guildSelection.status !== 'ready') return;
    try {
      if (selectedGuildId) localStorage.setItem(selectionKey(user), selectedGuildId);
      else localStorage.removeItem(selectionKey(user));
    } catch { /* 저장소 사용 불가 시 메모리만 사용 */ }
  }, [user, selectedGuildId, isRevalidating, guildSelection.status]);

  const startLogin = useCallback(async () => {
    setError(null);
    try { const { url } = await authApi.authorize(); window.location.assign(url); }
    catch (err) { const failure = toApiError(err); setError(failure); throw failure; }
  }, []);

  const completeLogin = useCallback(async ({ code, state }) => {
    const epoch = ++generation.current;
    guildController.current?.abort(); pendingGuilds.current = null;
    clearScope(true); setWorkspaceRequestsBlocked(true); setError(null); setGuilds([]); setUser(null); setStatus('checking-callback');
    try {
      const result = await authApi.login({ code, state });
      if (epoch !== generation.current) throw new ApiError({ status: 0, code: 'CANCELED' });
      currentUser.current = result.user;
      tokenStore.set(result); setExpiresAt(result.expiresAt); setUser(result.user);
      if (Array.isArray(result.guilds)) applyGuilds(result, result.user, true);
      else {
        const snapshot = await authApi.guilds();
        if (epoch !== generation.current) throw new ApiError({ status: 0, code: 'CANCELED' });
        applyGuilds(snapshot, result.user, true);
      }
      setIsRevalidating(false); setStatus('authenticated'); return result.user;
    } catch (err) { if (epoch === generation.current) resetSession(toApiError(err)); throw toApiError(err); }
  }, [applyGuilds, clearScope, resetSession]);

  const logout = useCallback(async () => {
    generation.current++;
    guildController.current?.abort();
    clearScope(true); setWorkspaceRequestsBlocked(true); setStatus('checking'); setGuilds([]); setUser(null);
    try { await authApi.logout(); } catch { /* 로컬 세션은 실패 시에도 비운다. */ }
    finally { resetSession(); }
  }, [clearScope, resetSession]);

  const selectGuild = useCallback((id) => {
    if (isRevalidating || !guilds.some((g) => g.id === id) || id === selectedGuildId) return;
    clearScope(); preferredGuild.current = id; setSelectedGuildId(id);
  }, [clearScope, guilds, isRevalidating, selectedGuildId]);
  const selectedGuild = !isRevalidating && guildSelection.status === 'ready'
    ? guilds.find((g) => g.id === selectedGuildId) ?? null : null;
  const value = useMemo(() => ({
    status, isAuthenticated: status === 'authenticated',
    isChecking: status === 'checking' || status === 'checking-callback',
    user, guilds, guildSelection, isRevalidating, scopeKey, selectedGuild,
    guildId: selectedGuild?.id ?? null, canManage: canManageGuild(selectedGuild), error,
    selectGuild, reloadGuilds: loadGuilds, retrySession: restoreSession, startLogin, completeLogin, logout,
  }), [status, user, guilds, guildSelection, isRevalidating, scopeKey, selectedGuild, error, selectGuild, loadGuilds, restoreSession, startLogin, completeLogin, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 <AuthProvider> 안에서만 사용할 수 있습니다.');
  return ctx;
}

/** Retain the verified workspace's local drafts while its data is hidden for revalidation. */
export function WorkspaceAuthProvider({ value, children }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
