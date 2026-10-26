import { useEffect, useState } from 'react';
import { ErrorState, LoadingState } from '../components/ApiState.jsx';
import { DecisionCard, PageHead } from '../components/ui.jsx';
import { useWhySearch } from '../hooks/useWhySearch.js';
import { navigate, useDebouncedCallback } from '../router.js';

const EXAMPLES = ['왜 위치 공유를 뺐지?', '차별점이 왜 바뀌었지?', '왜 단체여행부터 시작하지?'];

export default function SearchPage({ route, guildId }) {
  const q = route.params.q ?? '';
  const [text, setText] = useState(q);
  const { search, results, answer, isSearching, isEmpty, error, errorMessage } = useWhySearch(guildId);

  // 시안처럼 입력하는 대로 검색 — 서버 AI 검색이라 입력을 멈추고 0.6초 뒤에 요청
  const liveSearch = useDebouncedCallback((value) => {
    if (value.trim()) navigate('/search', { q: value.trim() }, { replace: true });
  }, 600);

  // 주소의 q가 바뀌면 (상단 검색창·빠른 질문 포함) 검색 실행
  useEffect(() => {
    // 입력 중인 값의 앞뒤 공백은 유지 (실시간 검색 중 띄어쓰기가 사라지지 않게)
    setText((prev) => (prev.trim() === q ? prev : q));
    if (q.trim()) search(q);
  }, [q, search]);

  const submit = (value) => {
    const query = value.trim();
    if (!query) return;
    // 같은 질문을 다시 검색하면 주소가 같아 effect가 돌지 않으므로 직접 실행
    if (query === q) search(query);
    else navigate('/search', { q: query });
  };

  // MVP: "AI 요약 답변 + 관련 카드". AI 요약(명세 10.7 answer)이 아직 없으면
  // 요약인 척하지 않고, 상위 3개 결정의 근거를 "관련 근거"라고 밝혀서 보여준다
  const hasAiAnswer = Boolean(answer);
  const summary = !results?.length
    ? '일치하는 결정 카드를 찾지 못했어요. 검색어를 짧게 입력하거나 아래 예시 질문을 선택해 보세요.'
    : answer || results.slice(0, 3).map((r) => r.card.why).filter(Boolean).join(' ');

  return (
    <>
      <PageHead title="왜 그렇게 결정했는지 바로 찾아보세요" desc="프로젝트의 과거 Decision과 원본 피드백을 자연어로 검색합니다." />
      <form
        className="why-search-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <label className="search-field" style={{ height: 42, maxWidth: 620, flex: 1 }}>
          <span>⌕</span>
          <input
            id="whySearch"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              liveSearch(e.target.value);
            }}
            placeholder="예) 초기 타깃을 좁힌 이유가 뭐야?"
            maxLength={1000}
            aria-label="질문"
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={isSearching}>
          {isSearching ? '검색 중…' : '검색'}
        </button>
      </form>
      <div className="toolbar-group" style={{ margin: '11px 0 14px' }}>
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="filter prompt" onClick={() => submit(example)}>
            {example}
          </button>
        ))}
      </div>

      {isSearching ? (
        <LoadingState rows={3} label="관련 결정을 찾고 있어요…" />
      ) : error ? (
        error.code === 'CLIENT_VALIDATION' ? (
          <p className="field-error">{errorMessage}</p>
        ) : (
          <ErrorState error={error} message={errorMessage} onRetry={() => submit(text || q)} title="검색하지 못했어요" />
        )
      ) : results ? (
        <>
          <section className="answer-panel">
            <b>
              ✦ WHY 요약 답변
              {!hasAiAnswer && results.length > 0 && (
                <span className="pending-badge" title="AI 요약 답변: API 명세 10.7 search 응답의 answer 필드 (미구현)">
                  AI 요약 준비 중
                </span>
              )}
            </b>
            {!hasAiAnswer && results.length > 0 && (
              <p className="answer-note">AI 요약이 준비될 때까지 관련 결정의 근거를 대신 보여드려요.</p>
            )}
            <p>{summary}</p>
          </section>
          <div className="section-head">
            <h2>관련 Decision</h2>
            <span className="muted">{results.length}개</span>
          </div>
          <div className="decision-list">
            {isEmpty ? (
              <div className="empty-state">
                관련된 결정을 찾지 못했어요.
                <br />
                질문의 표현을 바꾸거나 다른 키워드로 다시 시도해보세요.
              </div>
            ) : (
              results.map((item) => (
                <DecisionCard
                  key={item.card.id}
                  card={item.card}
                  onOpen={() => navigate(`/decision/${encodeURIComponent(item.card.id)}`)}
                  extraMeta={
                    <>
                      {item.excerpt && <span>· “{item.excerpt}”</span>}
                      <span>· 관련도 {Math.round(item.score * 100)}%</span>
                      {item.sourceUrl && (
                        <a href={item.sourceUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          · Discord 원본 ↗
                        </a>
                      )}
                    </>
                  }
                />
              ))
            )}
          </div>
        </>
      ) : null}
    </>
  );
}
