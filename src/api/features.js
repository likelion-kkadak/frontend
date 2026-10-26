/**
 * 명세서 10장 "FE 요청 API (미구현)"에 적은 API를 켜는 플래그.
 * BE가 구현하면 .env의 VITE_PROPOSED_APIS에 이름을 추가한다. (all = 전부)
 *   예) VITE_PROPOSED_APIS=decisionDelete,listFilters
 *
 * 꺼져 있으면 팀원 시안의 UI는 그대로 보이되, 해당 조작은 "API 준비 중"으로 비활성화된다.
 * (서버가 모르는 필드·경로로 요청하면 400/404가 나서 기존 기능까지 깨지므로)
 */
export const PROPOSED_APIS = {
  decisionDelete: 'DELETE /api/v1/decisions/{id} — 카드 삭제',
  decisionStatus: 'PATCH /api/v1/decisions/{id}/status — 상태 직접 변경',
  decisionEditExtra: 'PUT /api/v1/decisions/{id} 필드 추가 — 피드백 출처·날짜 편집',
  listFilters: 'GET /api/v1/decisions query 추가 — 기간·정렬',
  multiStatus: 'GET /api/v1/decisions status 여러 값 — 확정+보류 한 번에 조회',
  approvals: 'GET /api/v1/decisions/approvals — 승인 기록',
  botInvite: 'GET /api/v1/discord/bot-invite — 봇 초대 URL',
};

const enabled = new Set(
  String(import.meta.env.VITE_PROPOSED_APIS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

/** @param {keyof typeof PROPOSED_APIS} name */
export const isProposedEnabled = (name) => enabled.has('all') || enabled.has(name);

export const PENDING_LABEL = 'API 준비 중';

/** 비활성 컨트롤에 붙일 설명 */
export const pendingTitle = (name) => `${PENDING_LABEL} · ${PROPOSED_APIS[name]} (API 명세 10장)`;
