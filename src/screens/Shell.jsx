import { useEffect, useState } from 'react';
import SyncButton from '../components/SyncButton.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { useDashboard, useSyncJob } from '../hooks/useDashboard.js';
import DashboardPage from '../pages/DashboardPage.jsx';
import DetailPage from '../pages/DetailPage.jsx';
import ListPage from '../pages/ListPage.jsx';
import ReviewPage from '../pages/ReviewPage.jsx';
import SearchPage from '../pages/SearchPage.jsx';
import SettingsPage from '../pages/SettingsPage.jsx';
import TimelinePage from '../pages/TimelinePage.jsx';
import { navigate, useDebouncedCallback } from '../router.js';

const NAV = [
  { page: 'dashboard', icon: '⌂', label: '홈 대시보드' },
  { page: 'review', icon: '☷', label: '검수 큐' },
  { page: 'list', icon: '▤', label: '카드 전체 리스트' },
  { page: 'search', icon: '⌕', label: 'WHY 검색' },
  { page: 'timeline', icon: '◷', label: 'WHY Timeline' },
  { page: 'settings', icon: '⚙', label: '설정' },
];
const CRUMB = { ...Object.fromEntries(NAV.map((n) => [n.page, n.label])), decision: '카드 상세 / 편집' };

export default function Shell({ route }) {
  const { user, selectedGuild, guildId, canManage } = useAuth();
  const toast = useToast();

  // 대시보드 요약은 사이드바 뱃지·동기화 상태에도 쓰이므로 여기서 한 번만 조회
  const dashboard = useDashboard(guildId);
  const sync = useSyncJob(guildId, {
    activeJob: dashboard.latestJob,
    onFinished: (job) =>
      toast(
        job.status === 'COMPLETED'
          ? `동기화가 끝났어요. 새 결정 후보 ${job.decisionsFound}개를 찾았어요.`
          : '동기화에 실패했어요. 설정에서 채널 연결 상태를 확인해 주세요.',
      ),
  });

  useEffect(() => {
    if (sync.error) toast(sync.errorMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.error]);

  const startSync = async () => {
    const job = await sync.start();
    if (job) toast('동기화를 시작했어요. 끝나면 알려드릴게요.');
  };

  // 상단 검색창: 시안처럼 입력하면 WHY 검색 화면으로 이동 (서버 AI 검색이라 입력을 멈춘 뒤 0.5초 후)
  const [searchText, setSearchText] = useState('');
  const liveSearch = useDebouncedCallback((value) => {
    if (!value.trim()) return;
    navigate('/search', { q: value.trim() }, { replace: route.page === 'search' });
  }, 500);
  const submitSearch = (e) => {
    e.preventDefault();
    if (searchText.trim()) navigate('/search', { q: searchText.trim() });
  };
  // 다른 메뉴로 이동하면 상단 검색어를 비운다 (시안 동작)
  useEffect(() => {
    if (route.page !== 'search') setSearchText('');
  }, [route.page]);

  const activeNav = route.page === 'decision' ? 'list' : route.page;
  const initial = (user?.name ?? '?').slice(0, 1);

  const pageProps = { route, guildId, canManage, sync, startSync };
  let content;
  if (!guildId) {
    content = <NoGuild />;
  } else if (route.page === 'review') content = <ReviewPage {...pageProps} />;
  else if (route.page === 'list') content = <ListPage {...pageProps} dashboard={dashboard} />;
  else if (route.page === 'search') content = <SearchPage {...pageProps} />;
  else if (route.page === 'timeline') content = <TimelinePage {...pageProps} />;
  else if (route.page === 'settings') content = <SettingsPage {...pageProps} />;
  else if (route.page === 'decision') content = <DetailPage {...pageProps} />;
  else content = <DashboardPage {...pageProps} dashboard={dashboard} />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <button type="button" className="brand sidebar-brand" onClick={() => navigate('/dashboard')} aria-label="홈 대시보드로 이동">
          <img className="brand-mark logo-image" src="/assets/logo_kkadak.png" alt="" />
          <span>
            KKADAK<small>TEAM DECISION ARCHIVE</small>
          </span>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav className="nav" aria-label="주 메뉴">
          {NAV.map((item) => (
            <button
              key={item.page}
              type="button"
              className={activeNav === item.page ? 'active' : undefined}
              onClick={() => navigate(`/${item.page}`)}
            >
              <span className="nav-ico">{item.icon}</span>
              {item.label}
              {item.page === 'review' && <span className="count">{dashboard.counts.inReview}</span>}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">
            KKADAK&nbsp; / &nbsp;<b>{CRUMB[route.page] ?? '홈 대시보드'}</b>
          </div>
          <div className="top-actions">
            <form className="global-search" onSubmit={submitSearch} role="search">
              <span>⌕</span>
              <input
                id="globalSearch"
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  liveSearch(e.target.value);
                }}
                placeholder="어떤 결정을 찾으세요?"
                aria-label="WHY 검색"
              />
            </form>
            <SyncButton sync={sync} canManage={canManage} disabled={!guildId} onClick={startSync} />
            <button type="button" className="user-select" onClick={() => navigate('/settings', { tab: 'account' })}>
              <Avatar user={user} initial={initial} />
              <span>{selectedGuild?.name ?? user?.name} ⌄</span>
            </button>
          </div>
        </header>
        <div className="content">{content}</div>
      </main>
    </div>
  );
}

function Avatar({ user, initial }) {
  return user?.avatarUrl ? (
    <img className="avatar" src={user.avatarUrl} alt="" />
  ) : (
    <div className="avatar">{initial}</div>
  );
}

function NoGuild() {
  return (
    <div className="panel review-empty">
      <div className="metric-icon" style={{ margin: 'auto' }}>
        ◉
      </div>
      <h2>연결된 Discord 서버가 없어요</h2>
      <p>
        KKADAK 봇을 프로젝트 서버에 초대한 뒤
        <br />
        연결 설정에서 서버와 채널을 선택해 주세요.
      </p>
      <button type="button" className="btn btn-primary" onClick={() => navigate('/setup')}>
        연결 설정하기
      </button>
    </div>
  );
}
