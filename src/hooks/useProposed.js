/**
 * 명세 10장 (미구현 제안) API를 쓰는 화면용 훅.
 * 플래그가 꺼져 있으면 요청하지 않고 supported=false를 돌려준다.
 */
import { getApprovalActivity, getBotInviteUrl } from '../api/endpoints.js';
import { isProposedEnabled } from '../api/features.js';
import { useApiQuery } from './useApiQuery.js';
import { TAGS } from './queryBus.js';

/** 설정 > 계정의 최근 승인 기록 (10.5) */
export function useApprovals(guildId, { limit = 10 } = {}) {
  const supported = isProposedEnabled('approvals');
  const query = useApiQuery((signal) => getApprovalActivity(guildId, { limit }, { signal }), {
    deps: [limit],
    scopeKey: guildId,
    enabled: supported && Boolean(guildId),
    tags: [TAGS.DECISION_LIST],
  });
  return { ...query, supported, items: query.data?.items ?? [] };
}

/** 봇 초대 링크 환경변수 (API 대신 쓸 수 있는 임시 값) */
const ENV_INVITE_URL = import.meta.env.VITE_DISCORD_BOT_INVITE_URL || '';

/**
 * 봇 초대 URL (10.6). API가 없으면 환경변수 값을 쓰고, 둘 다 없으면 url=''.
 */
export function useBotInvite(guildId) {
  const supported = isProposedEnabled('botInvite');
  const query = useApiQuery((signal) => getBotInviteUrl(guildId, { signal }), {
    scopeKey: guildId ?? '',
    enabled: supported,
  });
  return {
    supported,
    url: (supported && query.data?.url) || ENV_INVITE_URL,
    isLoading: supported && query.isLoading,
    error: query.error,
  };
}
