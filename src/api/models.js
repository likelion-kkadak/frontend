/**
 * API 응답을 화면에서 쓰기 쉬운 형태로 바꾸는 도우미와 상수.
 */
import { createValidationError } from './errors.js';

export const DECISION_STATUS = {
  IN_REVIEW: 'IN_REVIEW',
  CONFIRMED: 'CONFIRMED',
  ON_HOLD: 'ON_HOLD',
  DISCARDED: 'DISCARDED',
  SUPERSEDED: 'SUPERSEDED',
};

export const DECISION_STATUS_LABEL = {
  IN_REVIEW: '검토 대기',
  CONFIRMED: '확정',
  ON_HOLD: '보류',
  DISCARDED: '삭제됨',
  SUPERSEDED: '교체됨',
};

/** 카드 전체 리스트·상세 디자인의 상태 표기 (보류는 시안·사용자 플로우 용어인 DEFERRED로 표시) */
export const DECISION_STATUS_CODE = {
  IN_REVIEW: '검토 대기',
  CONFIRMED: 'CONFIRMED',
  ON_HOLD: 'DEFERRED',
  DISCARDED: 'DELETED',
  SUPERSEDED: 'SUPERSEDED',
};

/**
 * Decision Card로 저장·관리되는 상태 (사용자 플로우 02: "확정·보류된 결정 후보는 Decision Card로 저장")
 * 검토 대기(IN_REVIEW)는 검수 큐에만, 검수 큐에서 삭제한 후보(DISCARDED)는 어디에도 보이지 않는다.
 */
export const CARD_STATUSES = ['CONFIRMED', 'ON_HOLD'];

/** 입력 가능한 카테고리 enum. 오래된 데이터엔 다른 문자열이 있을 수 있음 */
export const DECISION_CATEGORIES = ['타깃', '문제정의', '기능', '기술', 'BM', '기타'];

export const SYNC_JOB_STATUS = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

export const isSyncJobTerminal = (job) =>
  job?.status === SYNC_JOB_STATUS.COMPLETED || job?.status === SYNC_JOB_STATUS.FAILED;

export const ANALYSIS_STATUS_LABEL = {
  pending: '대기',
  'retry-pending': '자동 재시도 대기',
  'retained-failure': '확인 필요',
  'completed-with-candidates': '후보 저장 완료',
  'completed-no-decision': '후보 없음',
};

/** Discord MANAGE_GUILD 권한 비트 (1 << 5). permissions는 큰 정수 문자열이라 BigInt로 계산 */
const MANAGE_GUILD = 1n << 5n;

/** 채널 저장·수동 동기화·재시도 버튼 노출 판단용 (실제 허용 여부는 BE가 검사) */
export function canManageGuild(guild) {
  if (!guild) return false;
  if (guild.owner) return true;
  try {
    return (BigInt(guild.permissions ?? '0') & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

/** 배지 색상 클래스 (styles.css) */
export const CATEGORY_CLASS = {
  타깃: 'cat-pink',
  문제정의: 'cat-purple',
  기능: 'cat-blue',
  기술: 'cat-orange',
  BM: 'cat-teal',
  기타: 'cat-gray',
};

export const STATUS_CLASS = {
  CONFIRMED: 'st-confirmed',
  IN_REVIEW: 'st-draft',
  ON_HOLD: 'st-deferred',
  DISCARDED: 'st-discarded',
  SUPERSEDED: 'st-superseded',
};

/** ISO → '3시간 전' (일주일이 넘으면 날짜). 값이 없으면 null */
export function formatRelative(iso) {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}일 전` : formatDate(iso);
}

/** ISO → 'YYYY.MM.DD HH:mm' */
export function formatDateTime(iso) {
  const date = formatDate(iso);
  if (!date) return '';
  const d = new Date(iso);
  return `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ISO 문자열 → 'YYYY.MM.DD'. 값이 없으면 빈 문자열 (임의 날짜를 만들지 않음) */
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/**
 * V1DecisionDto → 카드 표시용 모델. (API 명세 4.1 화면 매핑)
 * title(없으면 topic), 본문 decisionContent(없으면 decision), 근거 rationaleSummary(없으면 rationale)
 */
export function toDecisionCard(dto) {
  const source = dto.source && typeof dto.source === 'object' ? dto.source : {};
  const channelName = typeof source.channelName === 'string' ? source.channelName : null;
  const createdDate = dto.dates?.createdDate ?? dto.createdAt ?? null;
  const confirmedDate = dto.confirmedDate ?? dto.dates?.confirmedDate ?? null;
  const reviewDays =
    createdDate && confirmedDate
      ? Math.max(0, Math.round((Date.parse(confirmedDate) - Date.parse(createdDate)) / 86400000))
      : null;
  return {
    feedbackSourceType: dto.feedbackSourceType || null,
    feedbackSourceDetail: dto.feedbackSourceDetail || null,
    feedbackDate: dto.dates?.feedbackDate ?? dto.feedbackReceivedDate ?? null,
    /** 시안의 "출처" 표시: 피드백 출처가 있으면 그것, 없으면 채널 */
    sourceLabel: dto.feedbackSourceType || (channelName ? `#${channelName}` : ''),
    /** 생성일 → 확정일 사이 일수 (시안의 "N일간 검토됨") */
    reviewDays: Number.isNaN(reviewDays) ? null : reviewDays,
    id: dto.id,
    version: dto.version,
    status: dto.status,
    statusLabel: DECISION_STATUS_LABEL[dto.status] ?? dto.status,
    category: dto.category || dto.categoryTag || '기타',
    title: dto.title || dto.topic,
    summary: dto.decisionContent || dto.decision,
    why: dto.rationaleSummary || dto.rationale,
    confirmedDate,
    createdAt: dto.createdAt,
    date: formatDate(confirmedDate ?? dto.createdAt),
    pivot: Boolean(dto.isPivot),
    channelName,
    sourceUrl: typeof source.messageUrl === 'string' ? source.messageUrl : null,
    participants: Array.isArray(source.participants) ? source.participants : [],
    alternatives: dto.alternatives ?? [],
    actionItems: dto.actionItems ?? [],
    raw: dto,
  };
}

/** Timeline 그룹 key → 화면 라벨 ('2026-10' → '2026년 10월') */
export function formatTimelineKey(key, groupBy, { channelNames = {} } = {}) {
  if (groupBy === 'month') {
    const [y, m] = String(key).split('-');
    return y && m ? `${y}년 ${Number(m)}월` : key;
  }
  if (groupBy === 'channel') return channelNames[key] ? `#${channelNames[key]}` : key;
  return key;
}

/** ISO → <input type="date"> 값 'YYYY-MM-DD' (브라우저 로컬 기준) */
export function toDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → 로컬 자정 ISO. 빈 값은 null */
export function fromDateInput(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** 피드백 출처 선택지 (MVP 기능 범위표 "피드백 빠른 입력": 교수/심사위원/팀원/인터뷰이) */
export const FEEDBACK_SOURCE_TYPES = ['교수', '심사위원', '팀원', '인터뷰이'];

/** 카드 상세의 상태 선택지 (IA 06: 상태 관리 → 확정 / 보류) */
export const EDITABLE_STATUS_OPTIONS = [
  { value: 'ON_HOLD', code: 'DEFERRED', label: '보류된 결정' },
  { value: 'CONFIRMED', code: 'CONFIRMED', label: '확정된 결정' },
];

/**
 * 상태 변경이 가능한지. 바꿀 수 있는 상태는 확정·보류뿐이다 (IA 06).
 * - 상태 변경 API(10.2)가 있으면 확정 ↔ 보류, 검토 대기 → 확정·보류
 * - 없으면 기존 검수 API로 가능한 것만: 검토 대기 → 확정·보류, 보류 → 확정
 */
export function canChangeStatus(from, to, { statusApi = false } = {}) {
  if (from === to) return true;
  if (!CARD_STATUSES.includes(to)) return false;
  if (from === 'DISCARDED' || from === 'SUPERSEDED') return false;
  if (statusApi) return true;
  if (from === 'IN_REVIEW') return true;
  if (from === 'ON_HOLD') return to === 'CONFIRMED';
  return false;
}

export const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** 명세 10.3 (미구현 제안)으로 PUT에 추가 요청한 필드 */
export const EDIT_EXTRA_FIELDS = ['feedbackSourceType', 'feedbackSourceDetail', 'feedbackDate', 'confirmedDate'];

/**
 * 카드 편집 PUT 본문 생성. 허용 필드만 담는다 (status/state/summary 등은 BE가 400으로 거절).
 * @param {object} decision 마지막으로 조회한 V1DecisionDto (version 필수)
 * @param {object} changes  { title?, decision?, rationale?, category?, alternatives?, ...EDIT_EXTRA_FIELDS }
 * @param {{ includeExtra?: boolean }} [options] includeExtra: 10.3 필드를 보낼지 (BE 구현 후에만 true)
 *   바뀐 추가 필드만 보낸다. 생략 = 기존 값 유지, null = 지움
 */
export function buildDecisionEditPayload(decision, changes = {}, { includeExtra = false } = {}) {
  if (typeof decision?.version !== 'number') {
    // 임의로 1을 채우지 않는다 (API 명세 4.1 버전)
    throw createValidationError({ version: '카드 버전 정보가 없어요. 카드를 다시 불러와 주세요.' });
  }
  const pick = (key, fallback) => (changes[key] !== undefined ? changes[key] : fallback);
  const payload = {
    expectedVersion: decision.version,
    title: String(pick('title', decision.title || decision.topic) ?? '').trim(),
    decision: String(pick('decision', decision.decision) ?? '').trim(),
    rationale: String(pick('rationale', decision.rationale) ?? '').trim(),
    category: pick('category', decision.category),
    alternatives: (pick('alternatives', decision.alternatives) ?? []).map((alt) => ({
      ...(alt.id ? { id: alt.id } : {}), // 새 대안은 id 생략, 빠진 기존 대안은 삭제됨
      name: String(alt.name ?? '').trim(),
      reason: String(alt.reason ?? '').trim(),
    })),
  };

  const fieldErrors = validateDecisionEdit(payload);

  if (includeExtra) {
    const card = toDecisionCard(decision);
    const current = {
      feedbackSourceType: card.feedbackSourceType,
      feedbackSourceDetail: card.feedbackSourceDetail,
      feedbackDate: card.feedbackDate,
      confirmedDate: card.confirmedDate,
    };
    for (const key of EDIT_EXTRA_FIELDS) {
      if (changes[key] === undefined) continue;
      const next = typeof changes[key] === 'string' ? changes[key].trim() || null : changes[key];
      const same = key.endsWith('Date') ? toDateInput(next) === toDateInput(current[key]) : (next ?? null) === (current[key] ?? null);
      if (!same) payload[key] = next;
    }
    if ((payload.feedbackSourceType ?? '').length > 50) fieldErrors.feedbackSourceType = '피드백 출처는 50자 이하로 입력해 주세요.';
    if ((payload.feedbackSourceDetail ?? '').length > 200) fieldErrors.feedbackSourceDetail = '출처 설명은 200자 이하로 입력해 주세요.';
    if ('confirmedDate' in payload) {
      if (decision.status !== 'CONFIRMED') fieldErrors.confirmedDate = '확정된 결정에만 확정 날짜를 입력할 수 있어요.';
      else if (payload.confirmedDate && Date.parse(payload.confirmedDate) > Date.now()) fieldErrors.confirmedDate = '확정 날짜는 오늘 이후일 수 없어요.';
    }
  }

  if (Object.keys(fieldErrors).length) throw createValidationError(fieldErrors);
  return payload;
}

/** 편집 입력 검증 (API 명세 3.5 제약). 문제가 없으면 빈 객체 */
export function validateDecisionEdit(payload) {
  const errors = {};
  const len = (s) => (s ?? '').trim().length;

  if (len(payload.title) < 1 || len(payload.title) > 200) errors.title = '제목은 1~200자로 입력해 주세요.';
  if (len(payload.decision) < 1 || len(payload.decision) > 10000) errors.decision = '결정 내용은 1~10,000자로 입력해 주세요.';
  if (len(payload.rationale) < 1 || len(payload.rationale) > 10000) errors.rationale = '근거는 1~10,000자로 입력해 주세요.';
  if (!DECISION_CATEGORIES.includes(payload.category)) errors.category = '카테고리를 다시 선택해 주세요.';

  if (payload.alternatives.length > 20) {
    errors.alternatives = '대안은 최대 20개까지 입력할 수 있어요.';
  } else {
    const ids = payload.alternatives.map((a) => a.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) errors.alternatives = '중복된 대안이 있어요.';
    payload.alternatives.forEach((alt, i) => {
      if (len(alt.name) < 1 || len(alt.name) > 200) errors[`alternatives.${i}.name`] = '대안 이름은 1~200자로 입력해 주세요.';
      if (len(alt.reason) < 1 || len(alt.reason) > 2000) errors[`alternatives.${i}.reason`] = '선택하지 않은 이유는 1~2,000자로 입력해 주세요.';
    });
  }
  return errors;
}
