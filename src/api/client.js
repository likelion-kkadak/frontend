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
  const token = tokenStore.getAccessToken();
  if (token && !config.headers.has('Authorization')) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

const unauthorizedListeners = new Set();

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
  let response;
  try {
    response = await apiClient.request(config);
  } catch (error) {
    const apiError = toApiError(error);
    const headers = error?.config?.headers;
    const sentToken = Boolean(headers?.get?.('Authorization') ?? headers?.Authorization);
    // 토큰을 보냈는데 401이면 세션 만료 → 토큰 제거 후 로그인 흐름 재시작 (API 명세 5장)
    if (apiError.status === 401 && sentToken) {
      tokenStore.clear();
      unauthorizedListeners.forEach((fn) => fn(apiError));
    }
    throw apiError;
  }

  const body = response.data;
  if (!body || body.success !== true) {
    throw new ApiError({
      status: response.status,
      code: body?.code ?? 'INVALID_RESPONSE',
      message: body?.message ?? '응답 형식이 올바르지 않습니다.',
      details: body?.data ?? null,
    });
  }
  return body.data;
}

/** path 파라미터 인코딩 (Discord snowflake 등 문자열 ID 그대로 사용) */
export const pathParam = (value) => encodeURIComponent(String(value));
