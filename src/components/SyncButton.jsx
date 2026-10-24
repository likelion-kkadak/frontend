/** "지금 동기화" 버튼. 관리 권한이 없거나 진행 중이면 비활성화 */
export default function SyncButton({ sync, canManage, disabled, onClick, className = 'btn btn-primary sync-button' }) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled || sync.isRunning || !canManage}
      title={canManage ? undefined : '동기화는 서버 관리자만 실행할 수 있어요'}
    >
      {sync.isStarting ? '요청 중…' : sync.isRunning ? `↻ 동기화 중 ${sync.progress}%` : '↻ 지금 동기화'}
    </button>
  );
}
