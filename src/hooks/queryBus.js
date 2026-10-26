/**
 * 화면 간 데이터 갱신 신호.
 * 예) 검수 성공 → invalidate(TAGS.REVIEW_QUEUE, TAGS.DASHBOARD …) 하면
 *     해당 태그로 구독 중인 useApiQuery들이 다시 조회한다. (API 명세 6장)
 */
export const TAGS = {
  DASHBOARD: 'dashboard',
  REVIEW_QUEUE: 'reviewQueue',
  DECISION_LIST: 'decisionList',
  DECISION_DETAIL: 'decisionDetail',
  TIMELINE: 'timeline',
  SEARCH: 'search',
  CHANNELS: 'channels',
  ANALYSIS: 'analysisDeliveries',
};

/** 검수·편집·동기화 완료처럼 카드 데이터가 바뀌었을 때 다시 볼 목록 */
export const DECISION_CHANGED_TAGS = [
  TAGS.REVIEW_QUEUE,
  TAGS.DECISION_LIST,
  TAGS.DECISION_DETAIL,
  TAGS.DASHBOARD,
  TAGS.TIMELINE,
];

const listeners = new Map();

export function subscribeTags(tags, fn) {
  tags.forEach((tag) => {
    if (!listeners.has(tag)) listeners.set(tag, new Set());
    listeners.get(tag).add(fn);
  });
  return () => tags.forEach((tag) => listeners.get(tag)?.delete(fn));
}

export function invalidate(...tags) {
  const targets = new Set();
  tags.flat().forEach((tag) => listeners.get(tag)?.forEach((fn) => targets.add(fn)));
  targets.forEach((fn) => fn());
}
