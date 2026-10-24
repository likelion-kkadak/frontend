import { DECISION_CATEGORIES, formatDate, formatTimelineKey, toDecisionCard } from '../api/models.js';
import { ErrorState, InlineSpinner, LoadingState } from '../components/ApiState.jsx';
import { useToast } from '../components/Toast.jsx';
import { DecisionCard, PageHead } from '../components/ui.jsx';
import { toRangeParams, useTimeline } from '../hooks/useDecisions.js';
import { navigate } from '../router.js';

// IA 08: 카테고리 필터 + 결정 타임라인 + Notion 복사. 타임라인은 결정 확정일 기준 월별로 묶는다
const GROUP_BY = 'month';

/** 시안의 카드별 날짜 줄: '10.13　 화요일' */
function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  return `${md}　 ${d.toLocaleDateString('ko-KR', { weekday: 'long' })}`;
}

export default function TimelinePage({ route, guildId }) {
  const toast = useToast();
  const { start = '', end = '', category = '' } = route.params;
  const timeline = useTimeline(guildId, { groupBy: GROUP_BY, ...toRangeParams(start, end) });

  const setParams = (next) => navigate('/timeline', { start, end, category, ...next });

  // 카테고리 필터: Timeline 응답에 전체 확정 결정이 들어 있어 화면에서 거른다 (페이지 나눔 없음)
  const groups = timeline.groups
    .map((group) => {
      const cards = group.items.map(toDecisionCard).filter((c) => !category || c.category === category);
      return { ...group, cards, label: formatTimelineKey(group.key, GROUP_BY) };
    })
    .filter((g) => g.cards.length > 0);

  const copyAsMarkdown = async () => {
    const text = [
      '# WHY Timeline',
      ...groups.flatMap((g) => [
        `\n## ${g.label} (${g.cards.length})`,
        ...g.cards.map((c) => `- **${c.title}** (${formatDate(c.confirmedDate)})\n  - 결정: ${c.summary}\n  - 이유: ${c.why}`),
      ]),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('Notion에 붙여넣을 수 있는 형식으로 복사했어요.');
    } catch {
      toast('복사하지 못했어요. 브라우저의 클립보드 권한을 확인해 주세요.');
    }
  };

  return (
    <>
      <PageHead
        title="WHY Timeline"
        desc="프로젝트의 주요 결정과 방향 전환을 시간순으로 확인하세요."
        right={timeline.isFetching && !timeline.isLoading ? <InlineSpinner /> : null}
      />
      <div className="toolbar-group timeline-filters">
        {['전체', ...DECISION_CATEGORIES].map((c) => {
          const value = c === '전체' ? '' : c;
          return (
            <button key={c} type="button" className={`filter${category === value ? ' active' : ''}`} onClick={() => setParams({ category: value })}>
              {c}
            </button>
          );
        })}
        <button type="button" className="btn btn-outline" onClick={copyAsMarkdown} disabled={!groups.length}>
          Notion으로 복사
        </button>
      </div>
      <div className="toolbar timeline-options">
        <div className="toolbar-group">
          <input className="date-input" type="date" aria-label="시작일" value={start} onChange={(e) => setParams({ start: e.target.value })} />
          <span className="muted">~</span>
          <input className="date-input" type="date" aria-label="종료일" value={end} onChange={(e) => setParams({ end: e.target.value })} />
        </div>
      </div>

      {timeline.rangeError ? (
        <p className="field-error">{timeline.rangeError}</p>
      ) : timeline.isLoading ? (
        <LoadingState rows={3} />
      ) : timeline.isError && !timeline.isSuccess ? (
        <ErrorState error={timeline.error} onRetry={timeline.refetch} title="Timeline을 불러오지 못했어요" />
      ) : !groups.length ? (
        <div className="empty-state">
          표시할 확정 결정이 없어요.
          <br />
          확정 날짜가 기록된 결정만 Timeline에 나타나요. 이전 결정은 카드 전체 리스트에서 확인하세요.
        </div>
      ) : (
        <>
          {timeline.isError && <ErrorState compact error={timeline.error} onRetry={timeline.refetch} />}
          <div className="timeline">
            {groups.map((group) => (
              <section key={group.key}>
                <h3 className="timeline-group-label">
                  {group.label} <span className="muted">{group.cards.length}건</span>
                </h3>
                {group.cards.map((card) => (
                  <div key={card.id}>
                    <div className="timeline-date">
                      {dayLabel(card.confirmedDate)} {card.pivot && <span className="badge pivot">PIVOT</span>}
                    </div>
                    <DecisionCard card={card} onOpen={() => navigate(`/decision/${encodeURIComponent(card.id)}`)} />
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
