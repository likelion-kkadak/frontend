import { useCallback, useEffect, useRef, useState } from 'react';
import { toApiError } from '../api/errors.js';
import { invalidate } from './queryBus.js';

/**
 * 생성·수정·검수 같은 변경 요청용 공통 훅.
 * - 진행 중에 다시 호출하면 새 요청을 보내지 않고 진행 중인 요청을 돌려준다 (중복 제출 → 409 방지)
 * - 성공하면 invalidates 태그를 갱신한다
 *
 * @template TArgs, TResult
 * @param {(...args: TArgs) => Promise<TResult>} mutationFn
 * @param {object} [options]
 * @param {string[]} [options.invalidates]              성공 시 다시 조회할 태그
 * @param {(data: TResult, ...args: TArgs) => void} [options.onSuccess]
 * @param {(error: import('../api/errors.js').ApiError, ...args: TArgs) => void} [options.onError]
 */
export function useApiMutation(mutationFn, { invalidates = [], onSuccess, onError } = {}) {
  const [state, setState] = useState({ isPending: false, error: null, data: undefined });
  const optionsRef = useRef({ mutationFn, invalidates, onSuccess, onError });
  optionsRef.current = { mutationFn, invalidates, onSuccess, onError };

  const inFlightRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** 실패하면 ApiError를 던진다. 결과에 따라 화면 흐름을 바꿀 때 사용 */
  const mutateAsync = useCallback((...args) => {
    if (inFlightRef.current) return inFlightRef.current;

    const { mutationFn: fn } = optionsRef.current;
    setState({ isPending: true, error: null, data: undefined });

    const promise = (async () => {
      // fn이 동기적으로 throw해도(입력 검증 실패 등) 아래 finally가 inFlightRef 설정 이후에 실행되도록 한 틱 미룬다.
      // 그렇지 않으면 실패한 promise가 inFlightRef에 남아 이후 요청이 모두 막힌다.
      await null;
      try {
        const data = await fn(...args);
        if (mountedRef.current) setState({ isPending: false, error: null, data });
        const opts = optionsRef.current;
        if (opts.invalidates.length) invalidate(opts.invalidates);
        opts.onSuccess?.(data, ...args);
        return data;
      } catch (error) {
        const apiError = toApiError(error);
        if (mountedRef.current) setState({ isPending: false, error: apiError, data: undefined });
        optionsRef.current.onError?.(apiError, ...args);
        throw apiError;
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = promise;
    return promise;
  }, []);

  /** 실패해도 던지지 않는다. 버튼 onClick에 바로 연결할 때 사용 (오류는 error 상태로 표시) */
  const mutate = useCallback((...args) => mutateAsync(...args).catch(() => undefined), [mutateAsync]);

  const reset = useCallback(() => setState({ isPending: false, error: null, data: undefined }), []);

  return { ...state, isError: Boolean(state.error), mutate, mutateAsync, reset };
}
