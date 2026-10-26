import { useEffect, useMemo, useState } from 'react';
import { PENDING_LABEL, pendingTitle } from '../api/features.js';
import { CATEGORY_CLASS, DECISION_STATUS_CODE, DECISION_STATUS_LABEL, STATUS_CLASS } from '../api/models.js';

export function PageHead({ title, desc, right }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">TEAM DECISION ARCHIVE</div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {right && <div className="date-note muted">{right}</div>}
    </div>
  );
}

/** 아직 BE API가 없는 컨트롤 옆에 붙이는 표시 (명세 10장) */
export function PendingBadge({ api }) {
  return (
    <span className="pending-badge" title={pendingTitle(api)}>
      {PENDING_LABEL}
    </span>
  );
}

/** 봇 초대 버튼: 초대 URL(명세 10.6 또는 환경변수)이 있으면 링크, 없으면 비활성 */
export function BotInviteButton({ invite, className, label }) {
  if (invite.url) {
    return (
      <a className={className} href={invite.url} target="_blank" rel="noreferrer">
        {label} ↗
      </a>
    );
  }
  return (
    <button type="button" className={className} disabled title={invite.isLoading ? '불러오는 중' : pendingTitle('botInvite')}>
      {label}
    </button>
  );
}

export function CategoryBadge({ category }) {
  return <span className={`badge ${CATEGORY_CLASS[category] ?? 'cat-purple'}`}>{category}</span>;
}

/** @param {{ status: string, code?: boolean }} props code: 디자인 표기(CONFIRMED / DEFERRED) */
export function StatusBadge({ status, code = false }) {
  const label = (code ? DECISION_STATUS_CODE : DECISION_STATUS_LABEL)[status] ?? status;
  return <span className={`badge ${STATUS_CLASS[status] ?? 'st-draft'}`}>{label}</span>;
}

/** 휴지통 아이콘 */
export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

/** Discord 로고 (원본 메시지 열기 버튼용) */
export function DiscordIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.618-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.246.198.373.292a.077.077 0 0 1-.007.127 12.3 12.3 0 0 1-1.873.892.076.076 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

/**
 * Decision Card 한 장 (프로토타입 decision() 마크업과 동일한 클래스)
 * @param {{ card: ReturnType<import('../api/models.js').toDecisionCard>, onOpen?: () => void, actions?: React.ReactNode, extraMeta?: React.ReactNode }} props
 */
export function DecisionCard({ card, onOpen, actions, extraMeta }) {
  const onKeyDown = (e) => {
    if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <article className="decision-card">
      <div className="decision-content">
        <div className="decision-main" role="button" tabIndex={0} onClick={onOpen} onKeyDown={onKeyDown}>
          <div className="tags">
            <CategoryBadge category={card.category} />
            <StatusBadge status={card.status} />
            {card.pivot && <span className="badge pivot">PIVOT</span>}
          </div>
          <h3>{card.title}</h3>
          <p>{card.summary}</p>
          <div className="meta">
            {card.date && <span>◷ {card.date}</span>}
            {card.sourceLabel && <span>· {card.sourceLabel}</span>}
            {extraMeta}
          </div>
        </div>
        {!actions && onOpen && (
          <button type="button" className="text-link chev" onClick={onOpen} aria-label="상세 보기">
            ›
          </button>
        )}
      </div>
      {actions}
    </article>
  );
}

export function Pagination({ pageInfo, onChange }) {
  const { currentPage, totalPages, totalElements } = pageInfo;
  if (!totalPages || totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="페이지 이동">
      <button type="button" className="filter" disabled={currentPage <= 1} onClick={() => onChange(currentPage - 1)}>
        ‹ 이전
      </button>
      <span className="muted">
        {currentPage} / {totalPages} 페이지 · 총 {totalElements}개
      </span>
      <button
        type="button"
        className="filter"
        disabled={currentPage >= totalPages}
        onClick={() => onChange(currentPage + 1)}
      >
        다음 ›
      </button>
    </nav>
  );
}

/**
 * 채널 체크 상태 관리. 서버 데이터(monitoredChannelIds)가 바뀌면 선택을 다시 맞춘다.
 */
export function useChannelSelection(guildId, monitoredChannelIds) {
  const serverKey = `${guildId}:${monitoredChannelIds.join(',')}`;
  const [selected, setSelected] = useState(() => new Set(monitoredChannelIds));

  useEffect(() => {
    setSelected(new Set(monitoredChannelIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isDirty = useMemo(() => {
    if (selected.size !== monitoredChannelIds.length) return true;
    return monitoredChannelIds.some((id) => !selected.has(id));
  }, [selected, monitoredChannelIds]);

  return { selected, toggle, isDirty, selectedIds: [...selected] };
}

/**
 * 채널 체크 목록
 * @param {'setup'|'settings'} variant  setup: 연결 설정 화면, settings: 설정 화면 스타일
 */
export function ChannelPicker({ channels, unavailableIds = [], selected, onToggle, disabled, variant = 'settings' }) {
  const className = variant === 'setup' ? 'channel-checks' : 'settings-channel-list';
  // 저장되어 있지만 목록에서 사라진 채널도 해제할 수 있도록 보여준다
  const missing = unavailableIds.filter((id) => !channels.some((ch) => ch.id === id));

  if (!channels.length && !missing.length) {
    return <div className="empty-state">Bot이 읽을 수 있는 텍스트 채널이 없어요. Bot 권한을 확인해 주세요.</div>;
  }

  return (
    <div className={className}>
      {channels.map((ch) => {
        const checked = selected.has(ch.id);
        // 접근 불가 채널은 새로 선택할 수 없고, 이미 선택된 경우 해제만 가능
        const locked = disabled || (!ch.accessible && !checked);
        return (
          <label key={ch.id} className={locked ? 'is-disabled' : undefined}>
            <input type="checkbox" checked={checked} disabled={locked} onChange={() => onToggle(ch.id)} />
            <span>
              <b>#{ch.name}</b>
              {/* 채널 설명: Discord 채널 주제(명세 10.8 topic)가 있으면 시안처럼 표시 */}
              <small>
                {!ch.accessible
                  ? 'Bot이 읽을 수 없는 채널 · 선택 해제를 권장해요'
                  : ch.topic || (checked ? '동기화 중' : '동기화 안 함')}
              </small>
            </span>
          </label>
        );
      })}
      {missing.map((id) => (
        <label key={id}>
          <input type="checkbox" checked={selected.has(id)} disabled={disabled} onChange={() => onToggle(id)} />
          <span>
            <b>삭제되었거나 볼 수 없는 채널</b>
            <small>ID {id} · 선택 해제 후 저장해 주세요</small>
          </span>
        </label>
      ))}
    </div>
  );
}
