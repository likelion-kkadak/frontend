import { useEffect, useRef, useState } from 'react';
import { isProposedEnabled, pendingTitle } from '../api/features.js';
import {
  DECISION_CATEGORIES,
  DECISION_STATUS_CODE,
  EDITABLE_STATUS_OPTIONS,
  FEEDBACK_SOURCE_TYPES,
  fromDateInput,
  toDateInput,
} from '../api/models.js';
import { ErrorState, LoadingState } from '../components/ApiState.jsx';
import { useToast } from '../components/Toast.jsx';
import { CategoryBadge, DiscordIcon, PendingBadge, StatusBadge } from '../components/ui.jsx';
import { useChangeDecisionStatus, useDecision, useDeleteDecision, useEditDecision } from '../hooks/useDecisions.js';
import { navigate } from '../router.js';

/**
 * 카드 상세 / 편집 (디자인: image/카드상세편집.png)
 * 상태는 보류(DEFERRED) · 확정(CONFIRMED) 중에서만 고른다. 확정·보류된 카드는 카드 전체 리스트에 나온다.
 */
const READ_ONLY = new Set(['SUPERSEDED', 'DISCARDED']);

export default function DetailPage({ route, guildId }) {
  const query = useDecision(guildId, route.id);

  if (query.isLoading) return <LoadingState rows={4} />;
  if (query.isError && !query.isSuccess) {
    return (
      <>
        <ErrorState error={query.error} message={query.errorMessage} onRetry={query.refetch} title="카드를 불러오지 못했어요" />
        <div className="center-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate('/list')}>
            카드 전체 리스트로
          </button>
        </div>
      </>
    );
  }
  if (!query.decision) return null;

  // 버전이 바뀌면(저장 성공·충돌 후 재조회) 폼을 최신 값으로 다시 그린다
  return (
    <DecisionForm
      key={`${query.decision.id}:${query.decision.version}`}
      guildId={guildId}
      decision={query.decision}
      card={query.card}
      onSaved={query.setData}
      backgroundError={query.isError ? query.error : null}
    />
  );
}

let altKey = 0;
const toAltRows = (alternatives = []) => alternatives.map((a) => ({ key: ++altKey, id: a.id, name: a.name, reason: a.reason }));

function initialForm(decision, card) {
  return {
    decision: decision.decision || '',
    rationale: decision.rationale || '',
    category: DECISION_CATEGORIES.includes(decision.category) ? decision.category : '',
    alternatives: toAltRows(decision.alternatives),
    feedbackSourceType: card.feedbackSourceType ?? '',
    feedbackSourceDetail: card.feedbackSourceDetail ?? '',
    feedbackDate: toDateInput(card.feedbackDate),
    confirmedDate: toDateInput(card.confirmedDate),
    status: decision.status,
  };
}

function DecisionForm({ guildId, decision, card, onSaved, backgroundError }) {
  const toast = useToast();
  const readOnly = READ_ONLY.has(decision.status);
  const extraEditable = isProposedEnabled('decisionEditExtra') && !readOnly;
  const [initial] = useState(() => initialForm(decision, card));
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const edit = useEditDecision(guildId);
  const statusChange = useChangeDecisionStatus(guildId);
  const remover = useDeleteDecision(guildId);

  // 오류는 토스트로 안내 (충돌이면 최신 카드가 다시 조회되며 폼이 새로 그려짐)
  useEffect(() => {
    if (edit.error && edit.error.code !== 'CLIENT_VALIDATION') toast(edit.errorMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit.error]);
  useEffect(() => {
    if (statusChange.error) toast(statusChange.errorMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusChange.error]);
  useEffect(() => {
    if (remover.error) toast(remover.errorMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remover.error]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setAlt = (key, field, value) =>
    setForm((f) => ({ ...f, alternatives: f.alternatives.map((a) => (a.key === key ? { ...a, [field]: value } : a)) }));
  const addAlt = () => setForm((f) => ({ ...f, alternatives: [...f.alternatives, { key: ++altKey, name: '', reason: '' }] }));
  const removeAlt = (key) => setForm((f) => ({ ...f, alternatives: f.alternatives.filter((a) => a.key !== key) }));

  const altKeyOf = (list) => JSON.stringify(list.map(({ id, name, reason }) => [id, name, reason]));
  const contentDirty =
    form.decision !== initial.decision ||
    form.rationale !== initial.rationale ||
    form.category !== initial.category ||
    altKeyOf(form.alternatives) !== altKeyOf(initial.alternatives) ||
    (extraEditable &&
      (form.feedbackSourceType !== initial.feedbackSourceType ||
        form.feedbackSourceDetail !== initial.feedbackSourceDetail ||
        form.feedbackDate !== initial.feedbackDate ||
        form.confirmedDate !== initial.confirmedDate));
  const statusDirty = form.status !== decision.status;

  const submit = async (e) => {
    e.preventDefault();
    if (!contentDirty && !statusDirty) {
      toast('변경된 내용이 없어요.');
      return;
    }
    setSaving(true);
    let latest = decision;
    try {
      if (contentDirty) {
        const updated = await edit.save(decision, {
          decision: form.decision,
          rationale: form.rationale,
          category: form.category,
          alternatives: form.alternatives.map(({ id, name, reason }) => ({ id, name, reason })),
          feedbackSourceType: form.feedbackSourceType,
          feedbackSourceDetail: form.feedbackSourceDetail,
          feedbackDate: fromDateInput(form.feedbackDate),
          confirmedDate: fromDateInput(form.confirmedDate),
        });
        if (!updated) return;
        latest = updated;
      }
      if (statusDirty) {
        const updated = await statusChange.change(latest, form.status);
        if (!updated) {
          if (latest !== decision) onSaved(latest); // 내용 저장은 성공했으므로 반영
          return;
        }
        latest = updated;
      }
      onSaved(latest);
      // 검토 대기 후보가 확정·보류되면 검수 큐에서 빠지고 카드 전체 리스트로 옮겨진다
      toast(
        statusDirty && decision.status === 'IN_REVIEW'
          ? `${form.status === 'CONFIRMED' ? '확정' : '보류'}했어요. 카드 전체 리스트에 추가됐어요.`
          : 'Decision Card 변경사항을 저장했어요.',
      );
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm('이 Decision Card를 삭제할까요?')) return;
    if (await remover.remove(decision)) {
      toast('카드를 삭제했습니다.');
      navigate('/list');
    }
  };

  const fe = edit.fieldErrors;
  const sourceOptions =
    FEEDBACK_SOURCE_TYPES.includes(form.feedbackSourceType) || !form.feedbackSourceType
      ? FEEDBACK_SOURCE_TYPES
      : [form.feedbackSourceType, ...FEEDBACK_SOURCE_TYPES];
  const extraTitle = extraEditable ? undefined : readOnly ? '수정할 수 없는 카드예요' : pendingTitle('decisionEditExtra');
  const statusPending = !statusChange.statusApi && decision.status === 'CONFIRMED';

  return (
    <>
      <nav className="detail-crumb" aria-label="위치">
        <button type="button" className="text-link" onClick={() => navigate('/list')}>
          카드 전체 리스트
        </button>
        <span aria-hidden="true">›</span>
        <b>카드 상세 / 편집</b>
      </nav>
      {backgroundError && <ErrorState compact error={backgroundError} />}

      <form className="detail-page" onSubmit={submit}>
        <section className="detail-card">
          <header className="detail-card-head">
            <div className="tags detail-badges">
              <CategoryBadge category={card.category} />
              <StatusBadge status={decision.status} code />
              {card.pivot && <span className="badge pivot">PIVOT (자동판단)</span>}
            </div>
            <h1>{card.title}</h1>
            {readOnly && <p className="muted">교체되었거나 삭제된 카드는 수정할 수 없어요.</p>}
          </header>

          <div className="detail-card-body">
            <div className="d-field">
              <label htmlFor="f-decision">결정 내용</label>
              <textarea id="f-decision" value={form.decision} onChange={set('decision')} disabled={readOnly} maxLength={10000} />
              {fe.decision && <span className="field-error">{fe.decision}</span>}
            </div>

            <div className="d-field">
              <label htmlFor="f-rationale">결정 근거</label>
              <textarea id="f-rationale" value={form.rationale} onChange={set('rationale')} disabled={readOnly} maxLength={10000} />
              {fe.rationale && <span className="field-error">{fe.rationale}</span>}
            </div>

            <div className="d-field">
              <label htmlFor="f-source-type">
                피드백 출처 {!extraEditable && !readOnly && <PendingBadge api="decisionEditExtra" />}
              </label>
              <div className="source-grid">
                <select
                  id="f-source-type"
                  value={form.feedbackSourceType}
                  onChange={set('feedbackSourceType')}
                  disabled={!extraEditable}
                  title={extraTitle}
                >
                  <option value="">출처 선택</option>
                  {sourceOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  value={form.feedbackSourceDetail}
                  onChange={set('feedbackSourceDetail')}
                  placeholder="예) 중간 발표 후 지도교수 피드백"
                  disabled={!extraEditable}
                  title={extraTitle}
                  maxLength={200}
                  aria-label="피드백 출처 설명"
                />
              </div>
              {(fe.feedbackSourceType || fe.feedbackSourceDetail) && (
                <span className="field-error">{fe.feedbackSourceType || fe.feedbackSourceDetail}</span>
              )}
            </div>

            <div className="d-field">
              <label htmlFor="f-category">카테고리</label>
              <select id="f-category" value={form.category} onChange={set('category')} disabled={readOnly}>
                {!form.category && <option value="">카테고리 선택 (현재: {decision.category || '없음'})</option>}
                {DECISION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {fe.category && <span className="field-error">{fe.category}</span>}
            </div>

            <div className="d-field">
              <label>검토했던 대안</label>
              {form.alternatives.length > 0 && (
                <div className="alt-list">
                  {form.alternatives.map((alt, i) => (
                    <details key={alt.key} className="alt-item" open={i === 0 || !alt.id}>
                      <summary>
                        대안 {i + 1}
                        {alt.name ? ` · ${alt.name}` : ''}
                      </summary>
                      <div className="alt-fields">
                        <input
                          value={alt.name}
                          onChange={(e) => setAlt(alt.key, 'name', e.target.value)}
                          placeholder="대안"
                          disabled={readOnly}
                          maxLength={200}
                          aria-label={`대안 ${i + 1} 이름`}
                        />
                        <input
                          value={alt.reason}
                          onChange={(e) => setAlt(alt.key, 'reason', e.target.value)}
                          placeholder="선택하지 않은 이유"
                          disabled={readOnly}
                          maxLength={2000}
                          aria-label={`대안 ${i + 1} 선택하지 않은 이유`}
                        />
                      </div>
                      {(fe[`alternatives.${i}.name`] || fe[`alternatives.${i}.reason`]) && (
                        <span className="field-error">{fe[`alternatives.${i}.name`] || fe[`alternatives.${i}.reason`]}</span>
                      )}
                      {!readOnly && (
                        <button type="button" className="text-link alt-remove" onClick={() => removeAlt(alt.key)}>
                          이 대안 삭제
                        </button>
                      )}
                    </details>
                  ))}
                </div>
              )}
              {form.alternatives.length === 0 && <p className="muted">기록된 대안이 없어요.</p>}
              {fe.alternatives && <span className="field-error">{fe.alternatives}</span>}
              {!readOnly && form.alternatives.length < 20 && (
                <button type="button" className="alt-add" onClick={addAlt}>
                  + 대안 추가
                </button>
              )}
            </div>

            <div className="d-field">
              <label>날짜 {!extraEditable && !readOnly && <PendingBadge api="decisionEditExtra" />}</label>
              <div className="date-boxes">
                <div className="date-box">
                  <label htmlFor="f-feedback-date">피드백 받은 날짜</label>
                  <input
                    id="f-feedback-date"
                    type="date"
                    value={form.feedbackDate}
                    onChange={set('feedbackDate')}
                    disabled={!extraEditable}
                    title={extraTitle}
                  />
                </div>
                <div className="date-box">
                  <label htmlFor="f-confirmed-date">결정 확정 날짜</label>
                  <input
                    id="f-confirmed-date"
                    type="date"
                    value={form.confirmedDate}
                    onChange={set('confirmedDate')}
                    disabled={!extraEditable || decision.status !== 'CONFIRMED'}
                    title={decision.status !== 'CONFIRMED' ? '확정된 결정에만 입력할 수 있어요' : extraTitle}
                  />
                  {fe.confirmedDate && <span className="field-error">{fe.confirmedDate}</span>}
                </div>
              </div>
              {card.reviewDays !== null && <div className="review-days">{card.reviewDays}일간 검토됨</div>}
            </div>

            <div className="d-field">
              <label>원본 근거</label>
              <p className="d-help">이 결정과 관련된 실제 Discord 대화 내용을 확인할 수 있습니다.</p>
              {card.sourceUrl ? (
                <a className="source-btn" href={card.sourceUrl} target="_blank" rel="noreferrer">
                  <DiscordIcon /> Discord 원본 메시지 열기 ↗
                </a>
              ) : (
                <button type="button" className="source-btn" disabled title="연결된 원본 메시지 링크가 없어요">
                  <DiscordIcon /> Discord 원본 메시지 열기 ↗
                </button>
              )}
            </div>

            <div className="d-field">
              <label htmlFor="f-status">
                상태 {statusPending && <PendingBadge api="decisionStatus" />}
              </label>
              <StatusDropdown
                value={form.status}
                current={decision.status}
                disabled={readOnly}
                canChange={(to) => statusChange.canChange(decision.status, to)}
                onChange={(next) => setForm((f) => ({ ...f, status: next }))}
              />
              {statusPending && <span className="d-help">확정된 결정을 보류로 바꾸는 기능은 서버 API 준비 중이에요.</span>}
              {decision.status === 'IN_REVIEW' && (
                <span className="d-help">검토 대기 중인 후보예요. 확정 또는 보류하면 카드 전체 리스트로 옮겨져요.</span>
              )}
            </div>
          </div>
        </section>

        <div className="detail-footer">
          <button
            type="button"
            className="btn-danger-soft"
            onClick={onDelete}
            disabled={!remover.supported || remover.isDeleting || saving}
            title={remover.supported ? undefined : pendingTitle('decisionDelete')}
          >
            {remover.isDeleting ? '삭제하는 중…' : '삭제'}
          </button>
          {!readOnly && (
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '저장하는 중…' : '변경사항 저장'}
            </button>
          )}
        </div>
      </form>
    </>
  );
}

/**
 * 상태 드롭다운 (디자인: DEFERRED / 보류된 결정, CONFIRMED / 확정된 결정 두 줄 항목 + 체크 표시)
 * 고를 수 있는 상태는 보류·확정뿐. 검토 대기 후보는 아직 선택 전 상태로 보여준다.
 */
function StatusDropdown({ value, current, disabled, canChange, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = EDITABLE_STATUS_OPTIONS.find((o) => o.value === value);
  const label = selected
    ? selected.code
    : value === 'IN_REVIEW'
      ? '확정 또는 보류를 선택하세요'
      : DECISION_STATUS_CODE[value] ?? value;

  return (
    <div className="status-dropdown" ref={ref}>
      <button
        type="button"
        id="f-status"
        className={`status-trigger${selected ? '' : ' placeholder'}`}
        data-value={value}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label}</span>
        <span className="chev-down" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <ul className="status-menu" role="listbox" aria-labelledby="f-status">
          {EDITABLE_STATUS_OPTIONS.map((o) => {
            const allowed = canChange(o.value);
            const isSelected = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={isSelected} aria-disabled={!allowed}>
                <button
                  type="button"
                  data-value={o.value}
                  className={isSelected ? 'selected' : undefined}
                  disabled={!allowed}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <span>
                    <b>{o.code}</b>
                    <small>
                      {o.label}
                      {!allowed && o.value !== current ? ' · API 준비 중' : ''}
                    </small>
                  </span>
                  {isSelected && <span className="check">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
