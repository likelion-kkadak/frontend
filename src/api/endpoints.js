/**
 * 화면에서 쓰는 v1 사용자 API 함수 모음 (Bot 전용 internal API는 제외).
 * 모든 함수는 envelope를 푼 data를 돌려주고, 실패하면 ApiError를 던진다.
 * GET 함수의 마지막 인자 `{ signal }`로 AbortController 취소를 지원한다.
 */
import { request, pathParam } from './client.js';

/* ───────────── 3.1 인증 ───────────── */

export const authApi = {
  /** Discord 인증 URL 발급 + HttpOnly state 쿠키 설정 → `{ url }` */
  authorize: () => request({ method: 'GET', url: '/api/v1/auth/authorize' }),

  /** FE 콜백에서 받은 code/state로 로그인 → `{ accessToken, tokenType, expiresAt, user }` */
  login: ({ code, state }) => request({ method: 'POST', url: '/api/v1/auth/login', data: { code, state } }),

  /** → AuthUserDto */
  me: ({ signal } = {}) => request({ method: 'GET', url: '/api/v1/auth/me', signal }),

  /** → `{ guilds: DiscordGuild[] }` */
  guilds: ({ signal } = {}) => request({ method: 'GET', url: '/api/v1/auth/guilds', signal }),

  /** 만료 전 토큰 교체 → `{ accessToken, tokenType, expiresAt }` */
  refresh: () => request({ method: 'POST', url: '/api/v1/auth/refresh' }),

  /** → null */
  logout: () => request({ method: 'POST', url: '/api/v1/auth/logout' }),
};

/* ───────────── 3.2 Discord 채널 설정 ───────────── */

/** → ChannelSettings `{ channels, monitoredChannelIds }` */
export const getChannelSettings = (guildId, { signal } = {}) =>
  request({ method: 'GET', url: '/api/v1/discord/channels', params: { guildId }, signal });

/** channelIds 전체 교체 (빈 배열 = 모두 해제). owner/Manage Server 권한 필요 → ChannelSettings */
export const saveChannelSettings = (guildId, channelIds) =>
  request({ method: 'PUT', url: '/api/v1/discord/channels', params: { guildId }, data: { channelIds } });

/* ───────────── 3.3 Dashboard · 동기화 ───────────── */

/** → DashboardDto `{ counts, recentDecisions, sync }` */
export const getDashboard = (guildId, { signal } = {}) =>
  request({ method: 'GET', url: '/api/v1/dashboard', params: { guildId }, signal });

/** 202 = 접수(완료 아님). 진행 중인 Job이 있으면 409 → SyncJobView */
export const createSyncJob = (guildId, { forceFullSync = false } = {}) =>
  request({ method: 'POST', url: '/api/v1/sync-jobs', params: { guildId }, data: { forceFullSync } });

/** → SyncJobView */
export const getSyncJob = (guildId, jobId, { signal } = {}) =>
  request({ method: 'GET', url: `/api/v1/sync-jobs/${pathParam(jobId)}`, params: { guildId }, signal });

/* ───────────── 3.4 Review Queue ───────────── */

/**
 * status: 'IN_REVIEW'(검수 대기, 기본) | 'ON_HOLD'(보류) — 두 상태를 한 번에 조회하는 API는 없음
 * → `{ items: V1ReviewTicketDto[], pageInfo }`
 */
export const getReviewQueue = (guildId, { status = 'IN_REVIEW', page = 1, size = 20 } = {}, { signal } = {}) =>
  request({ method: 'GET', url: '/api/v1/review-queue', params: { guildId, status, page, size }, signal });

/**
 * confirm / defer / reject. expectedVersion(마지막 조회 버전) 필수. 409면 재조회 후 다시 검수.
 * @param {object} body `{ action, expectedVersion, resolution?, predecessorId?, predecessorVersion?, taskDispositions?, title?, ... }`
 * → V1DecisionDto
 */
export const reviewCandidate = (guildId, ticketId, body) =>
  request({ method: 'POST', url: `/api/v1/review-queue/${pathParam(ticketId)}/review`, params: { guildId }, data: body });

/* ───────────── 3.5 ~ 3.6 Decision Card ───────────── */

/** → V1DecisionDto */
export const getDecision = (guildId, id, { signal } = {}) =>
  request({ method: 'GET', url: `/api/v1/decisions/${pathParam(id)}`, params: { guildId }, signal });

/**
 * 전체 교체 PUT. 허용 필드만 보내야 함(추가 필드는 400) → buildDecisionEditPayload 사용 권장
 * → V1DecisionDto (전체 카드)
 */
export const editDecision = (guildId, id, payload) =>
  request({ method: 'PUT', url: `/api/v1/decisions/${pathParam(id)}`, params: { guildId }, data: payload });

/** 분석 요청 / 재분석 이력 → CandidateHistoryEntry[] */
export const getDecisionHistory = (guildId, id, { signal } = {}) =>
  request({ method: 'GET', url: `/api/v1/decisions/${pathParam(id)}/history`, params: { guildId }, signal });

/**
 * 전체 목록. status·category 사용 권장 (state·categoryTag는 호환용)
 * from·to·dateField·sort는 명세 10.4 (미구현 제안) — listFilters 플래그가 켜졌을 때만 넘길 것
 * → `{ items: V1DecisionDto[], decisions, pageInfo }` — 화면은 items 사용
 */
export const getDecisions = (
  guildId,
  { status, category, topic, page = 1, size = 20, from, to, dateField, sort } = {},
  { signal } = {},
) =>
  request({
    method: 'GET',
    url: '/api/v1/decisions',
    params: {
      guildId,
      status: status || undefined,
      category: category || undefined,
      topic: topic || undefined,
      page,
      size,
      from: from || undefined,
      to: to || undefined,
      dateField: dateField || undefined,
      sort: sort || undefined,
    },
    signal,
  });

/* ───────────── 10장 FE 요청 API (미구현 제안) ───────────── */

/** 10.1 카드 삭제 → null */
export const deleteDecision = (guildId, id, expectedVersion) =>
  request({ method: 'DELETE', url: `/api/v1/decisions/${pathParam(id)}`, params: { guildId, expectedVersion } });

/** 10.2 상태 직접 변경 `{ status, expectedVersion }` → V1DecisionDto */
export const changeDecisionStatus = (guildId, id, { status, expectedVersion }) =>
  request({
    method: 'PATCH',
    url: `/api/v1/decisions/${pathParam(id)}/status`,
    params: { guildId },
    data: { status, expectedVersion },
  });

/** 10.5 서버의 최근 승인(확정) 기록 → `{ items: [{ decisionId, title, approvedAt, approvedBy: { id, name } }] }` */
export const getApprovalActivity = (guildId, { limit = 10 } = {}, { signal } = {}) =>
  request({ method: 'GET', url: '/api/v1/decisions/approvals', params: { guildId, limit }, signal });

/** 10.6 봇 초대 URL → `{ url }` */
export const getBotInviteUrl = (guildId, { signal } = {}) =>
  request({ method: 'GET', url: '/api/v1/discord/bot-invite', params: { guildId: guildId || undefined }, signal });

/* ───────────── 3.7 Why 검색 ───────────── */

/** query = 자연어 질문 (q 아님), limit 1–50 → `{ items: SearchResult[] }` */
export const searchDecisions = (guildId, query, { limit = 10 } = {}, { signal } = {}) =>
  request({ method: 'GET', url: '/api/v1/search', params: { guildId, query, limit }, signal, timeout: 30000 });

/* ───────────── 3.8 Timeline ───────────── */

/**
 * groupBy: 'month' | 'topic' | 'channel' | 'category', from 포함 · to 미포함 (ISO 8601)
 * → `{ groupBy, timezone, totalElements, groups: [{ key, count, items }] }`
 */
export const getDecisionTimeline = (guildId, { groupBy = 'month', timezone, from, to } = {}, { signal } = {}) =>
  request({
    method: 'GET',
    url: '/api/v1/decisions/timeline',
    params: { guildId, groupBy, timezone, from: from || undefined, to: to || undefined },
    signal,
  });

/* ───────────── 3.9 분석 실패 · 재시도 ───────────── */

/** → `{ requests: AnalysisDeliveryViewDto[], available, lastSynchronizedAt }` */
export const getAnalysisDeliveries = (guildId, { signal } = {}) =>
  request({ method: 'GET', url: '/api/v1/analysis-deliveries', params: { guildId }, signal });

/**
 * retained-failure만 재시도 가능. commandId: 새 명령엔 새 UUID, 같은 명령의 재전송엔 같은 값.
 * 202는 접수일 뿐 분석 완료가 아님 → AnalysisRetryCommandDto
 */
export const retryAnalysisRequest = (guildId, requestId, commandId) =>
  request({
    method: 'POST',
    url: `/api/v1/analysis-deliveries/${pathParam(requestId)}/retry`,
    params: { guildId },
    data: { commandId },
  });
