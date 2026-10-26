import {
  changeDecisionStatus,
  deleteDecision,
  editDecision,
  getDecision,
  getDecisionHistory,
  getDecisions,
  getDecisionTimeline,
  reviewCandidate,
} from '../api/endpoints.js';
import { createNotSupportedError, getErrorMessage, getFieldErrors } from '../api/errors.js';
import { isProposedEnabled } from '../api/features.js';
import { browserTimeZone, buildDecisionEditPayload, canChangeStatus, toDecisionCard } from '../api/models.js';
import { DECISION_CHANGED_TAGS, TAGS, invalidate } from './queryBus.js';
import { useApiMutation } from './useApiMutation.js';
import { useApiQuery } from './useApiQuery.js';

/* ───────────── 상세 ───────────── */

/** 카드 상세 (drawer/모달). id가 없으면 조회하지 않음 */
export function useDecision(guildId, decisionId) {
  const query = useApiQuery((signal) => getDecision(guildId, decisionId, { signal }), {
    // 다른 카드로 이동하면 이전 카드 내용을 즉시 숨긴다
    scopeKey: `${guildId}:${decisionId}`,
    enabled: Boolean(guildId && decisionId),
    tags: [TAGS.DECISION_DETAIL],
  });
  return {
    ...query,
    decision: query.data ?? null,
    card: query.data ? toDecisionCard(query.data) : null,
    errorMessage: getErrorMessage(query.error, { 404: '카드를 찾을 수 없어요. 삭제되었거나 다른 서버의 카드일 수 있어요.' }),
  };
}

/** 분석 요청 / 재분석 이력 (편집 버전 이력 아님) */
export function useDecisionHistory(guildId, decisionId, { enabled = true } = {}) {
  const query = useApiQuery((signal) => getDecisionHistory(guildId, decisionId, { signal }), {
    scopeKey: `${guildId}:${decisionId}`,
    enabled: Boolean(enabled && guildId && decisionId),
  });
  return { ...query, history: query.data ?? [] };
}

/* ───────────── 편집 ───────────── */

/**
 * 카드 편집 저장. 반환값은 갱신된 전체 카드.
 *
 * @example
 * const { decision, setData } = useDecision(guildId, id);
 * const { save, isSaving, fieldErrors, errorMessage } = useEditDecision(guildId, { onSaved: setData });
 * await save(decision, { title, rationale });
 */
export function useEditDecision(guildId, { onSaved } = {}) {
  const mutation = useApiMutation(
    (decision, changes) =>
      editDecision(
        guildId,
        decision.id,
        // 피드백 출처·날짜(명세 10.3)는 BE가 지원할 때만 보낸다 — 지원 전에 보내면 400
        buildDecisionEditPayload(decision, changes, { includeExtra: isProposedEnabled('decisionEditExtra') }),
      ),
    {
      invalidates: [...DECISION_CHANGED_TAGS, TAGS.SEARCH],
      onSuccess: (updated) => onSaved?.(updated),
      onError: (error) => {
        // 버전 충돌: 자동으로 덮어쓰지 않고 최신 카드를 다시 불러와 사용자가 재확인
        if (error.status === 409) invalidate(TAGS.DECISION_DETAIL);
      },
    },
  );

  return {
    /** 실패하면 null 반환 (오류는 errorMessage / fieldErrors로 표시) */
    save: (decision, changes) => mutation.mutateAsync(decision, changes).catch(() => null),
    isSaving: mutation.isPending,
    error: mutation.error,
    fieldErrors: getFieldErrors(mutation.error),
    errorMessage: getErrorMessage(mutation.error, {
      403: '이 카드를 수정할 권한이 없어요.',
      409: '다른 팀원이 먼저 카드를 수정했어요. 최신 내용을 불러왔으니 확인 후 다시 저장해 주세요.',
    }),
    isConflict: mutation.error?.status === 409,
    reset: mutation.reset,
  };
}

/* ───────────── 삭제 · 상태 변경 (명세 10.1 · 10.2) ───────────── */

/** 카드 삭제. decisionDelete 플래그가 꺼져 있으면 supported=false */
export function useDeleteDecision(guildId, { onDeleted } = {}) {
  const supported = isProposedEnabled('decisionDelete');
  const mutation = useApiMutation(
    (decision) => {
      if (!supported) throw createNotSupportedError('카드 삭제 API가 아직 준비되지 않았어요.');
      return deleteDecision(guildId, decision.id, decision.version);
    },
    { invalidates: [...DECISION_CHANGED_TAGS, TAGS.SEARCH], onSuccess: (_r, decision) => onDeleted?.(decision) },
  );
  return {
    supported,
    remove: (decision) => mutation.mutateAsync(decision).then(() => true, () => false),
    isDeleting: mutation.isPending,
    error: mutation.error,
    errorMessage: getErrorMessage(mutation.error, {
      403: '이 카드를 삭제할 권한이 없어요.',
      409: '다른 팀원이 먼저 수정했거나 다른 결정과 연결된 카드라 삭제할 수 없어요.',
    }),
  };
}

/**
 * 상세 화면의 상태 선택.
 * - 상태 변경 API(10.2)가 켜져 있으면 PATCH
 * - 꺼져 있으면 기존 검수 API로 가능한 전환만 처리 (검수 필요 → 확정·보류, 보류 → 확정)
 */
export function useChangeDecisionStatus(guildId) {
  const statusApi = isProposedEnabled('decisionStatus');
  const mutation = useApiMutation(
    (decision, nextStatus) => {
      if (!canChangeStatus(decision.status, nextStatus, { statusApi })) {
        throw createNotSupportedError('이 상태 변경은 아직 서버에서 지원하지 않아요.');
      }
      if (statusApi) {
        return changeDecisionStatus(guildId, decision.id, { status: nextStatus, expectedVersion: decision.version });
      }
      return reviewCandidate(guildId, decision.id, {
        action: nextStatus === 'CONFIRMED' ? 'confirm' : 'defer',
        expectedVersion: decision.version,
        ...(nextStatus === 'CONFIRMED' && { resolution: 'independent' }),
      });
    },
    {
      invalidates: DECISION_CHANGED_TAGS,
      onError: (error) => {
        if (error.status === 409) invalidate(TAGS.DECISION_DETAIL);
      },
    },
  );
  return {
    statusApi,
    canChange: (from, to) => canChangeStatus(from, to, { statusApi }),
    /** 성공하면 갱신된 카드, 실패하면 null */
    change: (decision, nextStatus) => mutation.mutateAsync(decision, nextStatus).catch(() => null),
    isChanging: mutation.isPending,
    error: mutation.error,
    errorMessage: getErrorMessage(mutation.error, {
      400: '바꿀 수 없는 상태예요.',
      409: '다른 팀원이 먼저 수정했어요. 최신 내용을 불러왔으니 다시 확인해 주세요.',
    }),
  };
}

/* ───────────── 전체 목록 ───────────── */

const MAX_PAGE_SIZE = 100; // 목록 API의 size 상한

/**
 * 상태별 목록을 받아 서버와 같은 순서(생성일 최신순, 같으면 ID 오름차순)로 합친 뒤 요청한 페이지만 잘라 준다.
 * page × size개까지만 받으면 되므로 앞쪽 페이지는 상태당 요청 1번으로 끝난다.
 */
async function fetchMergedDecisions(guildId, statuses, params, signal) {
  const { page, size, sort } = params;
  const need = page * size;
  const chunk = Math.min(need, MAX_PAGE_SIZE);

  const lists = await Promise.all(
    statuses.map(async (status) => {
      const items = [];
      let total = 0;
      for (let p = 1; items.length < need; p += 1) {
        const res = await getDecisions(guildId, { ...params, status, page: p, size: chunk }, { signal });
        total = res.pageInfo.totalElements;
        items.push(...res.items);
        if (res.items.length < chunk || items.length >= total) break;
      }
      return { items, total };
    }),
  );

  const dir = sort === 'asc' ? 1 : -1;
  const merged = lists
    .flatMap((l) => l.items)
    .sort((a, b) => {
      const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      if (diff) return diff * dir;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  const totalElements = lists.reduce((sum, l) => sum + l.total, 0);

  return {
    items: merged.slice((page - 1) * size, page * size),
    decisions: [],
    pageInfo: { currentPage: page, pageSize: size, totalElements, totalPages: Math.ceil(totalElements / size) },
  };
}

/**
 * 카드 전체 리스트.
 * @param {{ status?: string, category?: string, topic?: string, page?: number, size?: number,
 *   startDate?: string, endDate?: string, sort?: 'desc'|'asc' }} [filters]
 *   '전체'·빈 값은 필터 없음으로 처리.
 *   startDate·endDate('YYYY-MM-DD')·sort는 명세 10.4 — listFilters 플래그가 꺼져 있으면 서버로 보내지 않는다
 */
export function useDecisionList(
  guildId,
  { status, category, topic, page = 1, size = 20, startDate, endDate, sort } = {},
) {
  const clean = (v) => (v && v !== '전체' && v !== '전체 상태' ? v : undefined);
  // status: 문자열 하나 또는 배열 (예: CARD_STATUSES = 확정+보류)
  const statuses = Array.isArray(status) ? status.filter(Boolean) : clean(status) ? [clean(status)] : [];
  const serverFilters = isProposedEnabled('listFilters');
  const range = serverFilters ? toRangeParams(startDate, endDate) : {};
  const params = {
    category: clean(category),
    topic: clean(topic),
    page,
    size,
    ...(serverFilters && {
      from: range.from,
      to: range.to,
      dateField: range.from || range.to ? 'createdAt' : undefined,
      sort: sort === 'asc' ? 'asc' : undefined,
    }),
  };

  const fetcher = (signal) => {
    if (statuses.length <= 1) return getDecisions(guildId, { ...params, status: statuses[0] }, { signal });
    // 여러 상태: BE가 지원하면(명세 10.9) 한 번에, 아니면 상태별로 받아 합친다
    if (isProposedEnabled('multiStatus')) return getDecisions(guildId, { ...params, status: statuses.join(',') }, { signal });
    return fetchMergedDecisions(guildId, statuses, params, signal);
  };

  const query = useApiQuery(fetcher, {
    deps: [statuses.join(','), params.category, params.topic, page, size, params.from, params.to, params.sort],
    scopeKey: guildId,
    enabled: Boolean(guildId),
    tags: [TAGS.DECISION_LIST],
  });

  const items = query.data?.items ?? []; // data.decisions는 호환용이므로 사용하지 않음
  return {
    ...query,
    items,
    cards: items.map(toDecisionCard),
    pageInfo: query.data?.pageInfo ?? { currentPage: page, pageSize: size, totalElements: 0, totalPages: 0 },
    isEmpty: query.isSuccess && items.length === 0,
  };
}

/* ───────────── Timeline ───────────── */

/**
 * WHY Timeline. 확인 날짜가 있는 CONFIRMED만 포함됨.
 * @param {{ groupBy?: 'month'|'topic'|'channel'|'category', timezone?: string, from?: string, to?: string }} [params]
 *   from(포함)·to(미포함)는 ISO 8601. <input type="date"> 값이면 toRangeParams()로 변환
 */
export function useTimeline(guildId, { groupBy = 'month', timezone = browserTimeZone(), from, to } = {}) {
  const rangeInvalid = Boolean(from && to && Date.parse(from) >= Date.parse(to));

  const query = useApiQuery((signal) => getDecisionTimeline(guildId, { groupBy, timezone, from, to }, { signal }), {
    deps: [groupBy, timezone, from, to],
    scopeKey: guildId,
    enabled: Boolean(guildId) && !rangeInvalid,
    tags: [TAGS.TIMELINE],
  });

  return {
    ...query,
    groups: query.data?.groups ?? [],
    totalElements: query.data?.totalElements ?? 0,
    isEmpty: query.isSuccess && query.data.groups.length === 0,
    rangeError: rangeInvalid ? '시작일은 종료일보다 앞이어야 해요.' : null,
  };
}

/**
 * 'YYYY-MM-DD' 날짜 입력 두 개 → Timeline from/to (to는 미포함이라 종료일 다음 날 0시)
 * 브라우저 로컬 시간 기준.
 */
export function toRangeParams(startDate, endDate) {
  const toIso = (dateStr, addDays = 0) => {
    if (!dateStr) return undefined;
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d + addDays);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  };
  return { from: toIso(startDate), to: toIso(endDate, 1) };
}
