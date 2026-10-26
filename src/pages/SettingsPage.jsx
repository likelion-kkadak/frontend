import { canManageGuild, formatRelative } from '../api/models.js';
import { ErrorState, LoadingState } from '../components/ApiState.jsx';
import { useToast } from '../components/Toast.jsx';
import { BotInviteButton, ChannelPicker, PageHead, PendingBadge, useChannelSelection } from '../components/ui.jsx';
import { useAnalysisDeliveries } from '../hooks/useAnalysisDeliveries.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useChannelSettings } from '../hooks/useChannelSettings.js';
import { useApprovals, useBotInvite } from '../hooks/useProposed.js';
import { navigate } from '../router.js';

/** 시안의 '08.28 · 18:42' */
function formatActivityTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TABS = [
  { id: 'connect', label: '♧　연결' },
  { id: 'account', label: '◉　계정' },
];

export default function SettingsPage({ route, guildId, canManage }) {
  const tab = TABS.some((t) => t.id === route.params.tab) ? route.params.tab : 'connect';
  return (
    <>
      <PageHead title="설정" desc="Discord 연결과 계정 정보를 관리합니다." />
      <div className="settings-layout">
        <nav className="panel settings-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'active' : undefined}
              onClick={() => navigate('/settings', { tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {tab === 'connect' && <ConnectTab guildId={guildId} canManage={canManage} />}
        {tab === 'account' && <AccountTab />}
      </div>
    </>
  );
}

/** 시안의 "KKADAK Bot 연결됨 · 정상" — 분석 상태 API의 available(Bot heartbeat)로 판단 */
function botStatusText(deliveries) {
  if (deliveries.isLoading) return 'KKADAK Bot 상태 확인 중…';
  if (deliveries.isError && !deliveries.isSuccess) return 'KKADAK Bot 상태를 확인하지 못했어요';
  if (deliveries.isStale) {
    const last = formatRelative(deliveries.lastSynchronizedAt);
    return `KKADAK Bot 응답 없음${last ? ` · 마지막 응답 ${last}` : ''}`;
  }
  return 'KKADAK Bot 연결됨 · 정상';
}

function ConnectTab({ guildId, canManage }) {
  const { selectedGuild } = useAuth();
  const toast = useToast();
  const settings = useChannelSettings(guildId);
  const selection = useChannelSelection(guildId, settings.monitoredChannelIds);
  const deliveries = useAnalysisDeliveries(guildId);
  const invite = useBotInvite(guildId);

  const save = async () => {
    const saved = await settings.save(selection.selectedIds);
    if (saved) toast('동기화 채널 설정을 저장했어요.');
  };

  return (
    <section className="panel settings-main">
      <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--line)' }}>
        <h3>동기화 채널 관리</h3>
        <p className="setting-intro">Decision 후보를 자동으로 Pull 동기화할 프로젝트 채널을 선택하세요.</p>
        <b className="field-label">연결된 서버</b>
        <div className="server-strip">
          <span className="server-logo">{selectedGuild?.name?.slice(0, 1) ?? 'D'}</span>
          <div>
            <b>{selectedGuild?.name}</b>
            <small>
              {botStatusText(deliveries)} · {canManage ? '관리 권한 있음' : '읽기 전용 · 관리 권한이 필요해요'}
            </small>
          </div>
          <BotInviteButton invite={invite} className="btn-link server-invite" label="Discord 봇 초대하기" />
        </div>
        <button type="button" className="text-link setup-again" onClick={() => navigate('/setup')}>
          연결 설정 다시 하기 →
        </button>
      </div>
      <div style={{ padding: '14px 18px' }}>
        <b className="field-label">동기화 채널</b>
        {settings.isLoading ? (
          <LoadingState rows={2} />
        ) : settings.isError && !settings.isSuccess ? (
          <ErrorState error={settings.error} onRetry={settings.refetch} title="채널 목록을 불러오지 못했어요" />
        ) : (
          <>
            {settings.unavailableChannelIds.length > 0 && (
              <p className="field-error">
                Bot이 읽을 수 없는 채널 {settings.unavailableChannelIds.length}개가 선택되어 있어요. 선택을 해제하고 저장해 주세요.
              </p>
            )}
            <ChannelPicker
              channels={settings.channels}
              unavailableIds={settings.unavailableChannelIds}
              selected={selection.selected}
              onToggle={selection.toggle}
              disabled={!canManage || settings.isSaving}
            />
            {settings.saveError && <p className="field-error">{settings.saveErrorMessage}</p>}
            <div className="settings-save">
              <button
                type="button"
                className="btn btn-dark"
                onClick={save}
                disabled={!canManage || !selection.isDirty || settings.isSaving}
              >
                {settings.isSaving ? '저장하는 중…' : '변경사항 저장'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function AccountTab() {
  const { user, guilds, guildId, selectGuild, logout } = useAuth();
  const approvals = useApprovals(guildId);
  return (
    <section className="panel settings-main" style={{ padding: 18 }}>
      <h3>계정</h3>
      <p className="setting-intro">프로필 관리 · Discord 계정으로 로그인되어 있어요.</p>
      <div className="setting-row">
        <span>이름</span>
        <b>{user?.name}</b>
      </div>
      <div className="setting-row">
        <span>이메일</span>
        <b>{user?.email ?? 'Discord 계정 (이메일 미제공)'}</b>
      </div>
      <div className="setting-row">
        <span>Discord ID</span>
        <b>{user?.discordUserId}</b>
      </div>

      {/* 시안의 최근 승인 기록 (명세 10.5) */}
      <b className="field-label" style={{ marginTop: 16 }}>
        최근 승인 기록 {!approvals.supported && <PendingBadge api="approvals" />}
      </b>
      <div className="account-activity">
        {!approvals.supported ? (
          <p className="muted">승인 기록 API가 준비되면 이 서버에서 확정된 결정과 승인자가 여기에 표시돼요.</p>
        ) : approvals.isLoading ? (
          <LoadingState variant="spinner" label="승인 기록을 불러오는 중…" />
        ) : approvals.isError && !approvals.isSuccess ? (
          <ErrorState compact error={approvals.error} onRetry={approvals.refetch} />
        ) : approvals.items.length === 0 ? (
          <p className="muted">아직 승인된 결정이 없어요.</p>
        ) : (
          approvals.items.map((item) => (
            <div key={`${item.decisionId}:${item.approvedAt}`}>
              <button type="button" className="text-link activity-title" onClick={() => navigate(`/decision/${encodeURIComponent(item.decisionId)}`)}>
                {item.title}
              </button>
              <small>{formatActivityTime(item.approvedAt)}</small>
              <p>approved_by · {item.approvedBy?.name ?? '알 수 없음'}</p>
            </div>
          ))
        )}
      </div>

      <b className="field-label" style={{ marginTop: 16 }}>
        접근 가능한 서버
      </b>
      <div className="account-activity">
        {guilds.map((g) => (
          <div key={g.id}>
            <b>{g.name}</b>
            <small>{g.id === guildId ? '현재 선택됨' : ''}</small>
            <p>
              {g.owner ? '서버 소유자' : canManageGuild(g) ? '서버 관리 권한' : '멤버'}
              {g.id !== guildId && (
                <>
                  {' · '}
                  <button type="button" className="text-link" onClick={() => selectGuild(g.id)}>
                    이 서버로 전환
                  </button>
                </>
              )}
            </p>
          </div>
        ))}
      </div>

      <div className="settings-save">
        <button type="button" className="btn btn-outline" onClick={logout}>
          로그아웃
        </button>
      </div>
    </section>
  );
}
