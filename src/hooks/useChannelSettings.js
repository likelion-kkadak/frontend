import { getChannelSettings, saveChannelSettings } from '../api/endpoints.js';
import { createValidationError, getErrorMessage } from '../api/errors.js';
import { TAGS } from './queryBus.js';
import { useApiMutation } from './useApiMutation.js';
import { useApiQuery } from './useApiQuery.js';

const MAX_CHANNELS = 500;

/**
 * Discord 연결 설정 · 설정 화면의 채널 선택.
 *
 * @example
 * const { channels, save, isSaving } = useChannelSettings(guildId);
 * channels.map(ch => <input type="checkbox" defaultChecked={ch.isMonitored} disabled={!ch.accessible} />)
 * save(selectedIds)
 */
export function useChannelSettings(guildId) {
  const query = useApiQuery((signal) => getChannelSettings(guildId, { signal }), {
    scopeKey: guildId,
    enabled: Boolean(guildId),
    tags: [TAGS.CHANNELS],
  });

  const mutation = useApiMutation(
    (channelIds) => {
      const unique = [...new Set(channelIds)];
      if (unique.length > MAX_CHANNELS) {
        throw createValidationError({ channelIds: `채널은 최대 ${MAX_CHANNELS}개까지 선택할 수 있어요.` });
      }
      return saveChannelSettings(guildId, unique);
    },
    // 응답이 수정된 설정이므로 재조회 대신 그대로 반영
    { onSuccess: (updated) => query.setData(updated) },
  );

  const settings = query.data;
  const monitored = new Set(settings?.monitoredChannelIds ?? []);
  const channels = (settings?.channels ?? []).map((ch) => ({ ...ch, isMonitored: monitored.has(ch.id) }));
  const knownIds = new Set(channels.map((ch) => ch.id));

  return {
    ...query,
    channels,
    monitoredChannelIds: settings?.monitoredChannelIds ?? [],
    /** 저장되어 있지만 목록에 없거나 Bot이 읽을 수 없는 채널 → 해제 안내용 */
    unavailableChannelIds: [...monitored].filter(
      (id) => !knownIds.has(id) || channels.find((ch) => ch.id === id)?.accessible === false,
    ),
    /** 선택 전체를 교체 저장. 빈 배열 = 모두 해제 */
    save: (channelIds) => mutation.mutateAsync(channelIds).catch(() => null),
    isSaving: mutation.isPending,
    saveError: mutation.error,
    saveErrorMessage: getErrorMessage(mutation.error, {
      400: 'Bot이 읽을 수 없는 채널이 포함되어 있어요. 선택을 확인해 주세요.',
      403: '채널 설정은 서버 소유자나 서버 관리 권한이 있는 사람만 바꿀 수 있어요.',
    }),
  };
}
