import { useEffect, useState } from 'react';
import { getErrorMessage } from '../api/errors.js';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Landing() {
  const { startLogin, error } = useAuth();
  const toast = useToast();
  const [isStarting, setIsStarting] = useState(false);

  // 세션 만료 등으로 로그아웃된 경우 안내
  useEffect(() => {
    if (error) toast(getErrorMessage(error));
  }, [error, toast]);

  const onStart = async () => {
    setIsStarting(true);
    try {
      await startLogin(); // 성공하면 Discord로 페이지 이동
    } catch (err) {
      toast(getErrorMessage(err, { 0: 'Discord 로그인 주소를 받지 못했어요. 서버 연결을 확인해 주세요.' }));
      setIsStarting(false);
    }
  };

  return (
    <section className="landing-wrap">
      <header className="landing-header">
        <div className="brand">
          <img className="brand-mark logo-image" src="/assets/logo_kkadak.png" alt="까닭 로고" />
          <span>
            KKADAK<small>TEAM DECISION ARCHIVE</small>
          </span>
        </div>
        <a href="#landing-features" className="landing-nav-link">
          서비스 알아보기 ↗
        </a>
      </header>
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <h1>
            팀의 중요한 결정,
            <br />
            <em>까닭</em>까지 기억해요.
          </h1>
          <p>
            AI가 대화의 맥락을 기억하고 정리해,
            <br />
            흩어진 논의도 다시 연결해줍니다.
          </p>
          <div className="landing-cta-row">
            <button type="button" className="btn btn-primary" onClick={onStart} disabled={isStarting}>
              {isStarting ? 'Discord로 이동하는 중…' : '◉  Discord로 시작하기  →'}
            </button>{' '}
            <a className="btn btn-outline btn-link" href="/?demo">
              데모 바로 보기
            </a>
          </div>
          <small className="landing-hero-note">Discord 연동 후 프로젝트 Decision은 자동으로 정리됩니다.</small>
        </div>
        <div className="landing-hero-art">
          <img src="/assets/dashbord_kkadak.png" alt="Discord 대화를 AI가 분석해 Decision Card로 정리하는 과정" />
        </div>
      </section>
      <section id="landing-features" className="landing-features">
        <h2>팀의 결정뿐 아니라, 그 이유까지 기억합니다.</h2>
        <p>
          대화 속에 묻혀 있던 중요한 의사결정과 맥락을 까닭(KKADAK)이 찾아내고, 다시 꺼내볼 수 있도록 아카이빙합니다.
        </p>
        <div className="landing-feature-grid">
          <article>
            <span>⌕</span>
            <h3>자동 기억</h3>
            <p>Discord 대화에서 중요한 의사결정 후보를 AI가 찾아 Decision Card 초안으로 만들어줍니다.</p>
            <small>● 검토 대기 9건 자동 생성　 신경 쓰지 않아도 기록</small>
          </article>
          <article>
            <span>ϟ</span>
            <h3>근거 추적</h3>
            <p>결정마다 원본 Discord 메시지와 피드백 출처를 연결해 “왜 그렇게 했는지” 바로 확인할 수 있습니다.</p>
            <small>● Discord 원본 스레드로 1초 만에 이동</small>
          </article>
          <article>
            <span>⌛</span>
            <h3>타임라인 스토리</h3>
            <p>타깃·문제 정의·기능이 어떻게 바뀌었는지 시간순으로 연결해 프로젝트 변천사를 보여줍니다.</p>
            <small>● WHY Timeline으로 피봇 이력 추적</small>
          </article>
        </div>
      </section>
    </section>
  );
}
