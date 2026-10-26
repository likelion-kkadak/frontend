import { useState } from 'react';
import { ErrorState, LoadingState } from '../components/ApiState.jsx';
import { useToast } from '../components/Toast.jsx';
import { BotInviteButton, ChannelPicker, PendingBadge, useChannelSelection } from '../components/ui.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { useChannelSettings } from '../hooks/useChannelSettings.js';
import { useBotInvite } from '../hooks/useProposed.js';
import { navigate } from '../router.js';

/** 로그인 직후 Discord 연결 설정: Bot 초대 → 서버 선택 → 동기화 채널 선택 */
export default function Setup() {
  const { user, guilds, guildId, selectGuild, canManage, reloadGuilds, logout } = useAuth();
  const toast = useToast();
  const invite = useBotInvite(guildId);
  const settings = useChannelSettings(guildId);
  const selection = useChannelSelection(guildId, settings.monitoredChannelIds);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshGuilds = async () => {
    setIsRefreshing(true);
    try {
      await reloadGuilds();
      toast('서버 목록을 새로 불러왔어요.');
    } catch {
      toast('서버 목록을 불러오지 못했어요.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const finish = async () => {
    if (canManage && selection.isDirty) {
      const saved = await settings.save(selection.selectedIds);
      if (!saved) return; // 오류는 saveErrorMessage로 표시
      toast('동기화 채널을 저장했어요.');
    }
    navigate('/dashboard');
  };

  const hasChannels = selection.selected.size > 0;
  const step = !guilds.length ? 1 : hasChannels ? 3 : 2;

  return (
    <section className="setup-wrap">
      <header className="setup-header">
        <div className="brand">
          <img className="brand-mark logo-image" src="/assets/logo_kkadak.png" alt="까닭 로고" />
          <span>KKADAK</span>
        </div>
        <span className="setup-user">
          {user?.name} 님 ·{' '}
          <button type="button" className="text-link" onClick={logout}>
            로그아웃
          </button>
        </span>
      </header>
      <main className="setup-shell">
        <h1>Discord 연결 설정</h1>
        <p className="setup-subtitle">
          한 번만 설정하면 이후에는 선택한 채널의 프로젝트 대화를 KKADAK이 가져옵니다.
        </p>
        <div className="setup-stepper">
          <span className={step > 1 ? 'done' : 'current'}>
            {step > 1 ? '✓' : 1}
            <small>봇 초대</small>
          </span>
          <i />
          <span className={step > 2 ? 'done' : step === 2 ? 'current' : ''}>
            {step > 2 ? '✓' : 2}
            <small>서버 선택</small>
          </span>
          <i />
          <span className={step === 3 ? 'current' : ''}>
            3<small>채널 선택</small>
          </span>
        </div>

        <section className="setup-card">
          <div className="setup-card-head">
            <b>1</b>
            <div>
              <h2>Discord 서버에 봇 초대</h2>
              <p>OAuth 팝업을 열어 KKADAK 봇을 프로젝트 서버에 추가한 뒤 서버 목록을 새로고침하세요.</p>
            </div>
          </div>
          <div className="setup-card-actions">
            <BotInviteButton invite={invite} className="btn btn-primary btn-link" label="Discord 서버에 봇 초대" />
            {!invite.url && <PendingBadge api="botInvite" />}
            <button type="button" className="btn btn-outline" onClick={refreshGuilds} disabled={isRefreshing}>
              {isRefreshing ? '불러오는 중…' : '서버 목록 새로고침'}
            </button>
            <span className="connected-pill">{guilds.length ? `✓ 서버 ${guilds.length}개` : '연결 전'}</span>
          </div>
        </section>

        <section className="setup-card">
          <div className="setup-card-head">
            <b>2</b>
            <div>
              <h2>서버 선택</h2>
              <p>여러 서버에 접근할 수 있다면 현재 프로젝트 서버를 선택하세요.</p>
            </div>
          </div>
          <label className="field-label" htmlFor="serverSelect">
            연결할 서버
          </label>
          {guilds.length ? (
            <select
              id="serverSelect"
              className="setup-select"
              value={guildId ?? ''}
              onChange={(e) => selectGuild(e.target.value)}
            >
              {guilds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="empty-state">접근 가능한 서버가 없어요. 봇을 초대한 뒤 서버 목록을 새로고침해 주세요.</div>
          )}
        </section>

        <section className="setup-card">
          <div className="setup-card-head">
            <b>3</b>
            <div>
              <h2>동기화 채널 선택</h2>
              <p>Decision 후보를 가져올 프로젝트 채널을 선택하세요.</p>
            </div>
          </div>
          {!guildId ? (
            <p className="muted">서버를 먼저 선택해 주세요.</p>
          ) : settings.isLoading ? (
            <LoadingState rows={2} />
          ) : settings.isError ? (
            <ErrorState error={settings.error} onRetry={settings.refetch} compact />
          ) : (
            <>
              <ChannelPicker
                variant="setup"
                channels={settings.channels}
                unavailableIds={settings.unavailableChannelIds}
                selected={selection.selected}
                onToggle={selection.toggle}
                disabled={!canManage || settings.isSaving}
              />
              {!canManage && (
                <p className="muted">채널 설정은 서버 소유자나 서버 관리 권한이 있는 사람만 바꿀 수 있어요.</p>
              )}
            </>
          )}
          {settings.saveError && <p className="field-error">{settings.saveErrorMessage}</p>}
        </section>

        <div className="setup-footer">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/dashboard'))}
          >
            이전
          </button>
          <div className="setup-footer-actions">
            <a className="btn btn-ghost btn-link" href="/?demo">
              연결 없이 데모 보기
            </a>{' '}
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/dashboard')}>
              나중에 설정하기
            </button>{' '}
            <button type="button" className="btn btn-dark" onClick={finish} disabled={settings.isSaving || !guildId}>
              {settings.isSaving ? '저장하는 중…' : '완료, 대시보드로 이동'}
            </button>
          </div>
        </div>
      </main>
    </section>
  );
}
