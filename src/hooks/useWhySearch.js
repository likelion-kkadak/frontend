import { useCallback, useEffect, useRef, useState } from 'react';
import { searchDecisions } from '../api/endpoints.js';
import { createValidationError, getErrorMessage, toApiError } from '../api/errors.js';
import { toDecisionCard } from '../api/models.js';

const MAX_QUERY_LENGTH = 1000;

/**
 * WHY 검색. 사용자가 질문을 제출할 때만 요청한다.
 * 새 검색을 시작하면 이전 요청은 취소되어, 늦게 도착한 이전 결과가 화면을 덮어쓰지 않는다.
 *
 * @example
 * const { search, results, isSearching, errorMessage } = useWhySearch(guildId);
 * <form onSubmit={(e) => { e.preventDefault(); search(text); }}>
 */
export function useWhySearch(guildId, { limit = 10 } = {}) {
  const [state, setState] = useState({ results: null, lastQuery: '', error: null, isSearching: false });
  const controllerRef = useRef(null);

  // 서버가 바뀌면 이전 서버의 검색 결과를 지움
  useEffect(() => {
    controllerRef.current?.abort();
    setState({ results: null, lastQuery: '', error: null, isSearching: false });
  }, [guildId]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const search = useCallback(
    async (rawQuery) => {
      const query = String(rawQuery ?? '').trim();
      if (!query || query.length > MAX_QUERY_LENGTH) {
        setState((s) => ({
          ...s,
          error: createValidationError(
            { query: '질문을 입력해 주세요.' },
            query ? `질문은 ${MAX_QUERY_LENGTH.toLocaleString()}자 이하로 입력해 주세요.` : '질문을 입력해 주세요.',
          ),
        }));
        return null;
      }
      if (!guildId) return null;

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState((s) => ({ ...s, lastQuery: query, error: null, isSearching: true }));

      try {
        const { items, answer = null } = await searchDecisions(guildId, query, { limit }, { signal: controller.signal });
        if (controller.signal.aborted) return null;
        const results = items.map((item) => ({ ...item, card: toDecisionCard(item.decision) }));
        // answer는 명세 10.7 (미구현 제안) 필드. 없으면 화면에서 상위 결과의 근거로 대신 만든다
        setState({ results, answer, lastQuery: query, error: null, isSearching: false });
        return results;
      } catch (err) {
        const apiError = toApiError(err);
        if (apiError.isCanceled || controller.signal.aborted) return null;
        setState((s) => ({ ...s, error: apiError, isSearching: false }));
        return null;
      }
    },
    [guildId, limit],
  );

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setState({ results: null, lastQuery: '', error: null, isSearching: false });
  }, []);

  return {
    search,
    reset,
    /** null = 아직 검색 전, [] = 결과 없음 */
    results: state.results,
    /** 서버 요약 답변 (없으면 null) */
    answer: state.answer ?? null,
    lastQuery: state.lastQuery,
    isSearching: state.isSearching,
    isEmpty: Array.isArray(state.results) && state.results.length === 0,
    error: state.error,
    errorMessage: getErrorMessage(state.error, {
      503: '검색 엔진이 잠시 응답하지 않아요. 잠시 후 다시 검색해 주세요.',
    }),
  };
}
