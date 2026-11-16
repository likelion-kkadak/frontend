/** "지금 동기화" 버튼. 관리 권한이 없거나, Bot이 끊겼거나, 진행 중이면 비활성화 */
export default function SyncButton({ sync, canManage, botDown = false, disabled, onClick, className = 'btn btn-primary sync-button' }) {
  let title;
  if (botDown) title = 'Bot 연결을 확인할 수 없어 동기화할 수 없어요';
  else if (!canManage) title = '동기화는 서버 관리자만 실행할 수 있어요';
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled || botDown || sync.isRunning || !canManage}
      title={title}
    >
      {sync.isStarting ? '요청 중…' : sync.isRunning ? `↻ 동기화 중 ${sync.progress}%` : '↻ 지금 동기화'}
    </button>
  );
}
