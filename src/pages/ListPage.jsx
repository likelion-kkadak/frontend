import { isProposedEnabled, pendingTitle } from '../api/features.js';
import { CARD_STATUSES, DECISION_CATEGORIES } from '../api/models.js';
import { ErrorState, InlineSpinner, LoadingState } from '../components/ApiState.jsx';
import { CategoryBadge, Pagination, StatusBadge } from '../components/ui.jsx';
import { useDecisionList } from '../hooks/useDecisions.js';
import { navigate } from '../router.js';

/**
 * 카드 전체 리스트 (디자인: image/카드전체리스트.png)
 * Decision Card = 확정·보류된 결정만 (사용자 플로우 02, IA 05)
 */
const STATUS_TABS = [
  { value: '', label: '전체', countKey: 'all' },
  { value: 'CONFIRMED', label: '확정', countKey: 'confirmed', dot: 'dot-confirmed' },
  { value: 'ON_HOLD', label: '보류', countKey: 'onHold', dot: 'dot-hold' },
];

export default function ListPage({ route, guildId, dashboard }) {
  const { category = '', start = '', end = '', sort = 'desc' } = route.params;
  const status = CARD_STATUSES.includes(route.params.status) ? route.params.status : '';
  const page = Math.max(1, Number(route.params.page) || 1);
  const serverFilters = isProposedEnabled('listFilters');

  const list = useDecisionList(guildId, {
    status: status || CARD_STATUSES,
    category,
    page,
    startDate: start,
    endDate: end,
    sort,
  });

  // 필터를 주소에 저장 → 새로고침·뒤로가기 시 유지 (필터가 바뀌면 1페이지부터)
  const setFilter = (next) =>
    navigate('/list', { status, category, start, end, sort: sort === 'desc' ? '' : sort, ...next, page: next.page ?? 1 });

  const counts = {
    confirmed: dashboard?.counts.confirmed ?? 0,
    onHold: dashboard?.counts.onHold ?? 0,
  };
  counts.all = counts.confirmed + counts.onHold;

  const rangeInvalid = Boolean(start && end && start > end);
  const filterTitle = serverFilters ? '생성일 기준' : pendingTitle('listFilters');

  return (
    <>
      <div className="list-head">
        <div>
          <h1>카드 전체 리스트 {list.isFetching && !list.isLoading && <InlineSpinner />}</h1>
          <p>프로젝트의 모든 결정을 브라우징하고 상태·카테고리·날짜로 필터링하세요.</p>
        </div>
        <ListIllustration />
      </div>

      <div className="list-filter-bar">
        <div className="status-pills" role="tablist" aria-label="상태">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.countKey}
              type="button"
              role="tab"
              aria-selected={status === tab.value}
              className={`status-pill${status === tab.value ? ' active' : ''}`}
              onClick={() => setFilter({ status: tab.value })}
            >
              {tab.dot && <i className={tab.dot} aria-hidden="true" />}
              {tab.label}({dashboard?.isSuccess ? counts[tab.countKey] : '–'})
            </button>
          ))}
        </div>
        <div className="list-filter-controls">
          <select className="filter-select" aria-label="카테고리" value={category} onChange={(e) => setFilter({ category: e.target.value })}>
            <option value="">모든 카테고리</option>
            {DECISION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            className="filter-select"
            type="date"
            id="dateStart"
            aria-label="시작일"
            value={start}
            onChange={(e) => setFilter({ start: e.target.value })}
            disabled={!serverFilters}
            title={filterTitle}
          />
          <span className="muted">~</span>
          <input
            className="filter-select"
            type="date"
            id="dateEnd"
            aria-label="종료일"
            value={end}
            onChange={(e) => setFilter({ end: e.target.value })}
            disabled={!serverFilters}
            title={filterTitle}
          />
          <select
            id="sortSelect"
            className="filter-select"
            aria-label="정렬"
            value={sort}
            onChange={(e) => setFilter({ sort: e.target.value === 'desc' ? '' : e.target.value })}
            disabled={!serverFilters}
            title={serverFilters ? undefined : pendingTitle('listFilters')}
          >
            <option value="desc">최신순</option>
            <option value="asc">오래된순</option>
          </select>
        </div>
      </div>
      {!serverFilters && <p className="muted filter-note">기간·정렬 필터는 서버 API 준비 중이에요. 지금은 최신순으로 보여드려요.</p>}

      {rangeInvalid ? (
        <p className="field-error">시작일은 종료일보다 앞이어야 해요.</p>
      ) : list.isLoading ? (
        <LoadingState rows={4} />
      ) : list.isError && !list.isSuccess ? (
        <ErrorState error={list.error} onRetry={list.refetch} title="카드 목록을 불러오지 못했어요" />
      ) : (
        <>
          {list.isError && <ErrorState compact error={list.error} onRetry={list.refetch} />}
          {list.cards.length ? (
            <div className="table-wrap card-table-wrap">
              <table className="card-table">
                <thead>
                  <tr>
                    <th>결정</th>
                    <th>카테고리</th>
                    <th>상태</th>
                    <th>확정일</th>
                    <th>출처</th>
                  </tr>
                </thead>
                <tbody>
                  {list.cards.map((c) => (
                    <tr
                      key={c.id}
                      tabIndex={0}
                      onClick={() => navigate(`/decision/${encodeURIComponent(c.id)}`)}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/decision/${encodeURIComponent(c.id)}`)}
                    >
                      <td className="card-table-title">
                        <b>{c.title}</b>
                        {c.pivot && <span className="badge pivot">PIVOT</span>}
                        <span>{c.why || c.summary}</span>
                      </td>
                      <td>
                        <CategoryBadge category={c.category} />
                      </td>
                      <td>
                        <StatusBadge status={c.status} code />
                      </td>
                      <td className={c.confirmedDate ? 'date-cell' : 'date-cell unconfirmed'}>
                        {c.confirmedDate ? c.date : '미확정 (검수 필요)'}
                      </td>
                      <td className="source-cell">{c.feedbackSourceType || (c.channelName ? `#${c.channelName}` : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">조건에 맞는 Decision Card가 없습니다.</div>
          )}
          <Pagination pageInfo={list.pageInfo} onChange={(p) => setFilter({ page: p })} />
        </>
      )}
    </>
  );
}

/** 디자인 오른쪽 위의 카드 일러스트를 CSS로 단순화한 장식 */
function ListIllustration() {
  return (
    <div className="list-illust" aria-hidden="true">
      <span className="li-orbit" />
      <span className="li-ball li-ball-a" />
      <span className="li-ball li-ball-b" />
      <div className="li-card li-card-back" />
      <div className="li-card li-card-front">
        <i />
        <i />
        <i className="short" />
      </div>
      <div className="li-chart">
        <b />
        <b />
        <b />
      </div>
      <span className="li-check">✓</span>
    </div>
  );
}
