# 까닭 KKADAK — Frontend

> 팀의 중요한 결정과 그 **까닭(WHY)** 을 기억하는 팀 의사결정 아카이브

Discord 대화에서 AI가 찾아낸 결정 후보를 팀이 검수하고, 확정·보류된 결정을 Decision Card로 모아 검색하고 시간순으로 돌아볼 수 있는 웹 화면입니다.

## 주요 화면

| 화면 | 경로 | 설명 |
| --- | --- | --- |
| 랜딩 | (비로그인) | Discord 로그인 시작 |
| 연결 설정 | `#/setup` | 봇 초대, 서버 선택, 동기화할 채널 선택 |
| 홈 대시보드 | `#/dashboard` | 상태별 카드 수, 최근 생성된 카드, 동기화 상태 |
| 검수 큐 | `#/review` | AI가 찾은 결정 후보를 확정 / 보류 / 삭제 |
| 카드 전체 리스트 | `#/list` | 확정·보류된 Decision Card 목록, 상태·카테고리 필터 |
| 카드 상세 / 편집 | `#/decision/{id}` | 결정 내용·근거·대안·피드백 출처 편집, 상태 변경 |
| WHY 검색 | `#/search?q=...` | 자연어 질문으로 관련 결정 검색 |
| WHY Timeline | `#/timeline` | 확정된 결정을 월별로 보기, Notion용 복사 |
| 설정 | `#/settings` | 동기화 채널 관리, Bot 상태, 계정·서버 전환 |
| 데모 | `/?demo` | 샘플 데이터 프로토타입 (API 호출 없음) |

## 기술 스택

- React + Vite
- Axios (API 호출)
- 상태 관리·라우팅 라이브러리 없이 직접 구현
  - 라우팅: 해시 기반 (`src/router.js`) — 서버 설정 없이 새로고침·뒤로가기 지원
  - 데이터 조회: `useApiQuery` / `useApiMutation` 훅 + 태그 기반 재조회 (`src/hooks/queryBus.js`)

## 시작하기

### 1. 설치

```bash
npm install
```

### 2. 환경 변수

`.env.example`을 복사해 `.env`를 만듭니다.

```bash
cp .env.example .env
```

| 변수 | 설명 |
| --- | --- |
| `VITE_API_PROXY_TARGET` | 개발 서버의 `/api`·`/health` 프록시 대상. 기본값 `http://localhost:3001` |
| `VITE_API_BASE_URL` | 프록시 없이 BE Origin을 직접 호출할 때만 설정. 비우면 같은 Origin의 `/api` 사용 |
| `VITE_DISCORD_BOT_INVITE_URL` | 봇 초대 링크. 봇 초대 API가 생기기 전까지 쓰는 임시 값 |
| `VITE_PROPOSED_APIS` | BE가 구현한 "FE 요청 API" 이름을 쉼표로 나열 (`all` = 전부). 아래 [기능 플래그](#기능-플래그) 참고 |

### 3. 실행

로그인하려면 BE 서버(`http://localhost:3001`)가 실행 중이어야 합니다. BE가 꺼져 있으면 터미널에 `http proxy error … ECONNREFUSED` 로그가 반복되고 화면에는 "서버에 연결할 수 없습니다"와 다시 시도 버튼이 보입니다. BE를 켜면 새로고침 없이 자동으로 다시 연결됩니다.

```bash
npm run dev       # 개발 서버 → http://localhost:3002
npm run build     # 배포용 빌드 → dist/
npm run preview   # 빌드 결과 미리 보기
```

> 개발 서버 포트는 **3002로 고정**입니다(`strictPort`). Discord OAuth 콜백 URI가 3002 포트 기준으로 등록되어 있기 때문입니다. 다른 포트를 쓰려면 BE 설정과 Discord OAuth 등록값도 같이 바꿔야 합니다.

### 4. 배포 (Vercel)

배포 환경에는 Vite 개발 서버의 프록시가 없으므로, `vercel.json`의 `rewrites`가 `/api`·`/health` 요청을 Render BE(`https://ggadak.onrender.com`)로 넘깁니다. 배포 BE는 다른 Origin의 요청(CORS)을 허용하지 않으므로 이 프록시를 거쳐야 합니다.

| Vercel 환경변수 | 값 |
| --- | --- |
| `VITE_PROPOSED_APIS` | BE가 구현한 기능 플래그 (Production·Preview) |
| `VITE_API_BASE_URL` | **설정하지 않음.** 값을 넣으면 프록시를 거치지 않아 CORS로 막힘 |

`VITE_` 값은 빌드할 때 들어가므로 바꾼 뒤에는 Redeploy해야 합니다. Discord 로그인은 BE의 redirect_uri와 Discord OAuth Redirects에 배포 주소가 등록되어 있어야 동작합니다. Preview 배포는 주소가 매번 달라 로그인할 수 없습니다.

## 폴더 구조

```
src/
├── main.jsx, App.jsx     # 진입점. OAuth 콜백 → 세션 확인 → 랜딩/연결 설정/메인 화면 결정
├── router.js             # 해시 라우팅, navigate()
├── api/                  # BE 통신
│   ├── client.js         #   Axios 인스턴스, 응답 envelope 해제, 401 처리
│   ├── endpoints.js      #   API 함수 모음 (기능 영역별)
│   ├── models.js         #   응답 → 화면용 데이터 변환, 입력 검증, 상태 전환 규칙
│   ├── errors.js         #   ApiError, 오류 메시지 변환
│   ├── features.js       #   미구현 API 기능 플래그
│   └── tokenStore.js     #   accessToken 보관
├── hooks/                # 화면별 데이터 훅 (useAuth, useDecisions, useReviewQueue …)
├── screens/              # 레이아웃 단위 화면 (Landing, Setup, Shell, OAuthCallback, PrototypeDemo)
├── pages/                # Shell 안에 들어가는 메뉴별 페이지
├── components/           # 공통 UI (로딩·오류 상태, 토스트, 동기화 버튼, 배지 등)
├── styles.css            # 기본 스타일
├── app.css, redesign.css # React 화면·디자인 시안 반영 스타일
└── prototype.html        # 데모(/?demo)용 프로토타입 마크업
public/
├── assets/               # 로고 등 이미지
└── js/                   # 데모용 스크립트 (data.js, app.js)
```

## API 연동

### 공통 규칙

- 모든 응답은 `{ success, code, message, data }` 형태이며, `request()`가 `data`만 꺼내 돌려줍니다. 실패하면 항상 `ApiError`를 던집니다.
- 요청에는 `Authorization: Bearer <accessToken>`이 자동으로 붙습니다.
- 서버 데이터는 `guildId`(선택한 Discord 서버) 단위로 조회합니다. 서버를 바꾸면 이전 서버 데이터는 바로 숨깁니다.
- 편집·검수 요청에는 마지막으로 조회한 `expectedVersion`을 보냅니다. 409(버전 충돌)를 받으면 자동으로 덮어쓰지 않고 최신 데이터를 다시 불러와 사용자가 다시 확인하게 합니다.
- 검수·편집·동기화로 데이터가 바뀌면 관련 화면(검수 큐, 목록, 상세, 대시보드, Timeline)이 다시 조회됩니다.

### 로그인 흐름

1. 랜딩에서 `GET /auth/authorize`로 Discord 인증 URL을 받아 이동
2. Discord가 `?code=...&state=...`로 FE에 돌려보냄 → `POST /auth/login`
3. login 응답의 검증된 사용자·서버 목록으로 화면 표시
4. 선택한 서버에 동기화 채널이 없으면 연결 설정, 있으면 대시보드로 이동

- 새로고침 시 `POST /auth/session`을 HttpOnly 쿠키로 호출합니다. accessToken은 메모리에만 보관합니다.
- JWT는 만료 2분 전에 `POST /auth/token`으로 갱신하며 서버 목록을 함께 조회하지 않습니다.
- 예약 갱신과 API의 401 복구는 같은 인증 범위의 진행 중인 갱신을 공유합니다. 조회만 한 번 재시도하며 변경 요청은 자동 재전송하지 않습니다.
- 가입한 서버 중 봇이 설치된 서버만 목록에 표시합니다. 수동 새로고침·창 포커스·네트워크 재연결 때 목록을 재검증하며 고정 주기 폴링은 하지 않습니다.
- 목록 재검증 중에는 이전 카드·채널 화면을 제거하고 요청을 취소합니다. 확인 불가 상태는 재시도 화면으로 표시하고 로그인은 유지합니다.
- 서버 선택은 사용자별로 저장합니다. 선택한 서버가 제거되면 첫 번째 확인된 서버로 이동하고, 서버가 없으면 빈 상태를 표시합니다.
- 서버 재확인 중에는 이전 화면을 숨기고 조작·데이터 요청을 차단합니다. 동일한 계정·적격 서버로 복구하면 저장 전 카드·채널 편집을 유지하며, 계정 또는 선택 서버가 바뀌면 이전 화면을 제거합니다.
- Discord 동의 화면에서 사용자가 직접 취소하면(`error=access_denied`) 오류 안내 없이 쿠키 세션을 확인해 기존 계정 또는 랜딩으로 돌아갑니다.
- 그 외 이유로 로그인에 실패하면 랜딩 위에 "Discord 연결에 실패했습니다." 모달을 띄웁니다. ‘다시 시도’는 Discord 인증을 다시 시작하며, 실패하면 모달을 유지합니다.
- `npm test`는 실제 Chrome·React·HTTP 요청으로 세션 복원, 선택 무효화, 실제 화면의 초안 보존·인증 취소·로그인 실패 모달, JWT 갱신 경합, BE·Bot 연결 오류 안내를 검증합니다. Chrome 경로는 `CHROME_EXECUTABLE`로 지정합니다(기본값은 macOS 경로라 Windows에서는 필수, 예: `CHROME_EXECUTABLE="C:/Program Files/Google/Chrome/Application/chrome.exe" npm test`). GGADDAK에서는 Herdr verify pane에서 실행하며 실제 BE 연동은 부모 저장소 E2E에서 별도로 검증합니다.

## 기능 플래그

팀 UI 시안에는 있지만 아직 BE에 없는 기능은 BE에 API를 따로 요청해 두었습니다. 서버가 모르는 경로·필드로 요청하면 400·404가 나서 기존 기능까지 깨질 수 있으므로, 이 API들은 **플래그를 켰을 때만 호출**합니다. 꺼져 있으면 시안 UI는 그대로 보이고, 해당 조작만 "API 준비 중"으로 비활성화됩니다.

| 플래그 | API | 화면 |
| --- | --- | --- |
| `decisionDelete` | `DELETE /decisions/{id}` | 카드 상세 — 삭제 |
| `decisionStatus` | `PATCH /decisions/{id}/status` | 카드 상세 — 확정 ↔ 보류 전환 |
| `decisionEditExtra` | `PUT /decisions/{id}` 필드 추가 | 카드 상세 — 피드백 출처·날짜 편집 |
| `listFilters` | `GET /decisions` 기간·정렬 query | 카드 전체 리스트 |
| `multiStatus` | `GET /decisions` status 여러 값 | 카드 전체 리스트, 대시보드 |
| `approvals` | `GET /decisions/approvals` | 설정 > 계정 — 최근 승인 기록 |
| `botInvite` | `GET /discord/bot-invite` | 연결 설정, 설정 — 봇 초대 |

```bash
# 예) BE가 삭제와 기간 필터를 구현했을 때
VITE_PROPOSED_APIS=decisionDelete,listFilters
```

- 응답에 필드만 추가되는 항목(`search`의 `answer`, `discord/channels`의 `topic`)은 플래그 없이, 필드가 오면 바로 화면에 반영됩니다.
- 플래그가 꺼진 동안에는 기존 API로 가능한 만큼 대신 처리합니다. 예를 들어 보류 → 확정은 기존 검수 API로 바꾸고, 여러 상태의 목록은 상태별로 받아 FE에서 합칩니다.
- BE가 경로·필드 이름을 바꾸면 `src/api/endpoints.js`의 해당 함수만 고치면 됩니다.

## 연결 오류 처리

화면 진입은 로그인 여부만 확인합니다. BE·Bot·Discord 상태는 기능마다 필요한 것만 확인하고, 연결 문제는 화면을 막지 않고 안내만 합니다 (화면설계 V0.2).

| 상황 | 화면 | 동작 |
| --- | --- | --- |
| Discord 로그인 실패 | 랜딩 위 오류 모달 | ‘다시 시도’로 Discord 인증 재시작 |
| BE 응답 없음 | 대시보드 제목 아래 빨간 배너 | ‘다시 시도’로 연결 재확인 후 데이터 다시 조회. 기존 콘텐츠는 가리지 않음 |
| Bot 연결 끊김 | 동기화 영역에 "⚠ Bot 연결을 확인할 수 없습니다." | 동기화 버튼만 비활성화. 조회·검수·확정·수정·보류는 그대로 사용 |

- 연결 상태는 `src/hooks/useServerHealth.jsx`가 `GET /health`로 확인합니다. 평소 30초, 끊긴 연결이 있으면 10초마다 다시 확인하고, 창 포커스·네트워크 복귀 때도 확인합니다. 복구되면 안내가 자동으로 사라집니다.
- `/health` 응답의 `checks.database`가 `false`이거나 응답이 없으면 BE 오류, `checks.bot`이 `false`면 Bot 오류로 봅니다. 값이 없으면 막지 않습니다.
- 로그인 정보는 BE만 확인할 수 있어서, 앱을 열 때부터 BE가 꺼져 있으면 "서버에 연결할 수 없습니다" 화면이 보입니다. 서버가 다시 응답하면 자동으로 로그인 확인을 다시 합니다.

## AI 동작 상태

시연·디버깅 때 AI가 실제로 무엇을 하고 있는지 보이도록 대시보드에 "AI 동작 상태" 패널을 둡니다. BE에 새 API 없이 기존 동기화 Job과 분석 요청 목록을 합쳐 단계를 계산합니다 (`src/api/aiPipeline.js`).

| 단계 | 판단 근거 | 표시 |
| --- | --- | --- |
| 수집 요청 | 동기화 Job 생성 직후 또는 `QUEUED` | Bot이 작업을 시작하길 기다리는 중 |
| 메시지 수집 | Job 진행 중 (`GET /sync-jobs/{id}`) | 채널 진행 수, 확인한 메시지 수, 진행 막대 |
| AI 분석 | 분석 요청이 `pending`·`retry-pending` (`GET /analysis-deliveries`) | 분석 중인 채널 이름, 자동 재시도 대기 수 |
| 결과 | Job 완료 + 진행 중인 분석 없음 | 찾은 후보 수(검수 큐 바로가기), 실패 채널 수 |

- 동기화 중에는 단계 표시를 펼치고, 끝나면 결과 요약만 남깁니다. ‘자세히’를 누르면 채널별 상태·시도 횟수·마지막 오류와 작업 정보(Job ID, 상태 원문, 시각)를 볼 수 있고, 확인이 필요한 채널은 ‘다시 분석’할 수 있습니다.
- 이번 동기화 이후 갱신된 분석 요청(`synchronizedAt` ≥ Job 생성 시각)만 이번 회차 결과로 셉니다.
- Job `status`는 명세상 정해진 값이 없어 `QUEUED`·`PROCESSING`·`COMPLETED`·`FAILED` 외의 값은 진행 중으로 보고 원래 값을 그대로 표시합니다.
- 화면설계서가 아직 없는 화면이라, 디자인 확인 후 바뀔 수 있습니다.

## 데모 모드

`http://localhost:3002/?demo`로 접속하면 BE 없이 샘플 데이터로 만든 프로토타입 화면을 볼 수 있습니다. 실제 API는 호출하지 않습니다.

### 지속적인 권한 확인 실패

같은 계정·서버의 권한 오류는 자동 목록 재확인을 한 번만 시도합니다. 목록이 성공해도 실제 데이터 조회가 다시 실패하면 화면을 숨김·inert 상태로 유지하고 ‘다시 시도’를 제공합니다. 이 상태에서 포커스·온라인 복귀는 재시도를 시작하지 않습니다. 수동 재시도도 목록 확인 한 번을 사용하며, 실패했던 실제 요청이 성공해야 복구가 완료됩니다. 로그인과 같은 서버의 편집 초안은 보존하고, 변경 요청을 자동 재전송하지 않습니다.
