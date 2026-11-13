import axios from 'axios';
import { ApiError, toApiError } from './errors.js';
import { tokenStore } from './tokenStore.js';

/**
 * 공통 Axios 인스턴스.
 * - 기본은 같은 Origin의 /api (개발 시 Vite 프록시 → localhost:3001)
 * - OAuth state 쿠키 때문에 withCredentials 사용 (API 명세 1.1)
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  withCredentials: true,
  timeout: 15000,
  headers: { Accept: 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  if (workspaceRequestsBlocked && !config.url.startsWith('/api/v1/auth/')) {
    throw new ApiError({ status: 0, code: 'CANCELED' });
  }
  const token = tokenStore.getAccessToken();
  if (token && !config.headers.has('Authorization')) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

const unauthorizedListeners = new Set();
const guildAccessListeners = new Set();
const guildVerifiedListeners = new Set();
const requestKey = config => `${(config.method ?? 'GET').toUpperCase()} ${config.url} ${JSON.stringify(config.params ?? {})}`;
let scopeVersion = 0;
let authenticationVersion = 0;
let tokenRenewal = null;
let workspaceRequestsBlocked = true;

export function setWorkspaceRequestsBlocked(blocked) { workspaceRequestsBlocked = blocked; }

/** Both scheduled renewal and 401 recovery share the same authenticated-session request. */
export function renewAccessToken() {
  const authentication = authenticationVersion;
  if (tokenRenewal?.authentication === authentication) return tokenRenewal.promise;
  const accountId = tokenStore.get()?.userId;
  const promise = apiClient.post('/api/v1/auth/token').then(({ data }) => {
    if (authentication !== authenticationVersion) throw new ApiError({ status: 0, code: 'CANCELED' });
    if (!data?.success) throw new ApiError({ status: 401, code: 'UNAUTHORIZED' });
    if (accountId && data.data.userId && String(accountId) !== String(data.data.userId)) {
      throw new ApiError({ status: 401, code: 'ACCOUNT_CHANGED' });
    }
    tokenStore.set(data.data);
    return data.data;
  }).catch(error => {
    if (authentication !== authenticationVersion) throw new ApiError({ status: 0, code: 'CANCELED' });
    const failure = toApiError(error);
    if (failure.status === 401) restoreBrowserSession(failure);
    throw failure;
  }).finally(() => { if (tokenRenewal?.promise === promise) tokenRenewal = null; });
  tokenRenewal = { authentication, promise };
  return promise;
}

function restoreBrowserSession(error) {
  tokenStore.clear();
  unauthorizedListeners.forEach(fn => fn(error));
}

/** 이전 계정·서버에서 시작한 응답이 새 화면에 반영되는 것을 막는다. */
export function invalidateRequestScope() { scopeVersion++; }
export function invalidateAuthScope() { authenticationVersion++; invalidateRequestScope(); }
export function onGuildAccessChanged(fn) {
  guildAccessListeners.add(fn);
  return () => guildAccessListeners.delete(fn);
}

export function onGuildAccessVerified(fn) {
  guildVerifiedListeners.add(fn);
  return () => guildVerifiedListeners.delete(fn);
}

/** 로그인 세션이 끊겼을 때(401) 호출될 콜백을 등록한다. */
export function onUnauthorized(fn) {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}

/**
 * v1 API 호출 헬퍼. `{ success, code, message, data }` envelope를 풀어 data만 돌려주고,
 * 실패는 항상 ApiError로 던진다.
 * @template T
 * @param {import('axios').AxiosRequestConfig} config
 * @returns {Promise<T>}
 */
export async function request(config) {
  const scope = scopeVersion;
  let response;
  try {
    response = await apiClient.request(config);
  } catch (error) {
    const apiError = toApiError(error);
    if (scope !== scopeVersion) throw new ApiError({ status: 0, code: 'CANCELED' });
    const headers = error?.config?.headers;
    const sentToken = Boolean(headers?.get?.('Authorization') ?? headers?.Authorization);
    if (apiError.status === 401 && !config.url.startsWith('/api/v1/auth/')) {
      if (!config._tokenRetried) {
        try {
          await renewAccessToken();
        } catch (renewalError) {
          if (scope !== scopeVersion) throw new ApiError({ status: 0, code: 'CANCELED' });
          if (!['GET', 'HEAD'].includes((config.method ?? 'GET').toUpperCase())) throw apiError;
          throw toApiError(renewalError);
        }
        if (scope !== scopeVersion) throw new ApiError({ status: 0, code: 'CANCELED' });
        if (['GET', 'HEAD'].includes((config.method ?? 'GET').toUpperCase())) return request({ ...config, _tokenRetried: true });
        // 변경 요청은 토큰만 복구하고 자동 재전송하지 않는다.
        throw apiError;
      }
      restoreBrowserSession(apiError);
    } else if (apiError.status === 401 && (sentToken || ['/api/v1/auth/guilds', '/api/v1/auth/me'].includes(config.url)) && !['/api/v1/auth/session', '/api/v1/auth/login', '/api/v1/auth/authorize'].includes(config.url)) {
      // Cookie 세션이 여전히 유효할 수 있으므로 AuthProvider가 세션을 복원한다.
      restoreBrowserSession(apiError);
    }
    if (['GUILD_ACCESS_DENIED', 'GUILD_ACCESS_UNAVAILABLE'].includes(apiError.code)) {
      guildAccessListeners.forEach((fn) => fn(apiError, requestKey(config)));
    }
    throw apiError;
  }

  if (scope !== scopeVersion) throw new ApiError({ status: 0, code: 'CANCELED' });

  const body = response.data;
  if (!body || body.success !== true) {
    throw new ApiError({
      status: response.status,
      code: body?.code ?? 'INVALID_RESPONSE',
      message: body?.message ?? '응답 형식이 올바르지 않습니다.',
      details: body?.data ?? null,
    });
  }
  if (!config.url.startsWith('/api/v1/auth/')) guildVerifiedListeners.forEach(fn => fn(requestKey(config)));
  return body.data;
}

/** path 파라미터 인코딩 (Discord snowflake 등 문자열 ID 그대로 사용) */
export const pathParam = (value) => encodeURIComponent(String(value));
