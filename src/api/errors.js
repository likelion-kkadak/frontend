import axios from 'axios';

/**
 * 모든 API 실패를 하나의 형태로 다룬다.
 * 화면 로직은 message 문자열이 아니라 status·code로 분기한다. (API 명세 5장)
 */
export class ApiError extends Error {
  /**
   * @param {object} params
   * @param {number} params.status  HTTP 상태 (네트워크 오류는 0)
   * @param {string} params.code    BE code (VALIDATION_ERROR, CONFLICT …) 또는 FE 내부 code
   * @param {string} [params.message]
   * @param {unknown} [params.details] 실패 응답의 data (필드 오류 등)
   */
  constructor({ status, code, message, details = null }) {
    super(message || code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isCanceled() {
    return this.code === 'CANCELED';
  }

  get isNetworkError() {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }
}

/** axios 오류나 envelope 실패를 ApiError로 변환한다. */
export function toApiError(error) {
  if (error instanceof ApiError) return error;

  if (axios.isCancel(error) || error?.name === 'CanceledError' || error?.name === 'AbortError') {
    return new ApiError({ status: 0, code: 'CANCELED', message: '요청이 취소되었습니다.' });
  }

  if (axios.isAxiosError(error)) {
    if (!error.response) {
      const code = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'NETWORK_ERROR';
      return new ApiError({ status: 0, code, message: error.message });
    }
    const { status, data } = error.response;
    const isEnvelope = data && typeof data === 'object' && 'success' in data;
    return new ApiError({
      status,
      code: (isEnvelope && data.code) || fallbackCode(status),
      message: (isEnvelope && data.message) || error.message,
      details: isEnvelope ? data.data : null,
    });
  }

  return new ApiError({ status: 0, code: 'UNKNOWN', message: error?.message ?? String(error) });
}

/** 서버로 보내기 전에 FE에서 걸러낸 입력 오류. 400과 같은 방식으로 표시한다. */
export function createValidationError(fieldErrors, message = '입력값을 다시 확인해 주세요.') {
  return new ApiError({ status: 400, code: 'CLIENT_VALIDATION', message, details: { fieldErrors } });
}

function fallbackCode(status) {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  return status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN';
}

const CLIENT_CODES = new Set(['CLIENT_VALIDATION', 'OAUTH_CANCELED', 'NOT_SUPPORTED']);

/** 아직 BE API가 없어 실행할 수 없는 동작 */
export function createNotSupportedError(message = '아직 서버에서 지원하지 않는 기능이에요.') {
  return new ApiError({ status: 0, code: 'NOT_SUPPORTED', message });
}

const DEFAULT_MESSAGES = {
  0: '서버에 연결할 수 없어요. 네트워크 상태를 확인해 주세요.',
  400: '입력값을 다시 확인해 주세요.',
  401: '로그인이 만료되었어요. 다시 로그인해 주세요.',
  403: '이 서버에 접근할 권한이 없어요. 선택한 서버나 관리자 권한을 확인해 주세요.',
  404: '요청한 항목을 찾을 수 없어요.',
  409: '다른 변경 사항과 충돌했어요. 최신 내용을 다시 불러온 뒤 확인해 주세요.',
  429: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
  503: '외부 서비스가 일시적으로 응답하지 않아요. 잠시 후 다시 시도해 주세요.',
  500: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
};

/**
 * 사용자에게 보여줄 한국어 문구를 만든다.
 * @param {unknown} error
 * @param {Record<number|string, string>} [overrides] 화면별 문구. 키는 HTTP 상태 또는 code.
 *   예) getErrorMessage(err, { 409: '이미 처리된 후보예요.' })
 */
export function getErrorMessage(error, overrides = {}) {
  if (!error) return '';
  const apiError = toApiError(error);
  if (apiError.isCanceled) return ''; // 사용자가 화면을 떠나거나 새 요청으로 취소한 것은 오류로 보이지 않음
  if (overrides[apiError.code]) return overrides[apiError.code];
  if (overrides[apiError.status]) return overrides[apiError.status];
  // FE에서 직접 만든 오류는 이미 한국어 문구를 담고 있음
  if (CLIENT_CODES.has(apiError.code)) return apiError.message;
  if (apiError.code === 'TIMEOUT') return '응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.';
  if (DEFAULT_MESSAGES[apiError.status]) return DEFAULT_MESSAGES[apiError.status];
  if (apiError.status >= 500) return DEFAULT_MESSAGES[500];
  return '요청을 처리하지 못했어요. 다시 시도해 주세요.';
}

/**
 * 400 응답에서 필드별 오류를 꺼낸다. 서버 형식이 명세에 고정되어 있지 않아
 * { field: message | message[] } 형태일 때만 사용하고, 아니면 빈 객체를 돌려준다.
 */
export function getFieldErrors(error) {
  const details = error instanceof ApiError ? error.details : null;
  const source = details?.fieldErrors ?? details?.errors ?? details;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};

  const result = {};
  for (const [field, value] of Object.entries(source)) {
    if (typeof value === 'string') result[field] = value;
    else if (Array.isArray(value) && typeof value[0] === 'string') result[field] = value[0];
    else if (value && typeof value.message === 'string') result[field] = value.message;
  }
  return result;
}

/** 자동 재시도해도 되는 오류인지 (폴링 backoff 판단용) */
export function isRetryableError(error) {
  const apiError = toApiError(error);
  return apiError.isNetworkError || apiError.status === 429 || apiError.status >= 500;
}
