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
| `VITE_API_PROXY_TARGET` | 개발 서버의 `/api` 프록시 대상. 기본값 `http://localhost:3001` |
| `VITE_API_BASE_URL` | 프록시 없이 BE Origin을 직접 호출할 때만 설정. 비우면 같은 Origin의 `/api` 사용 |
| `VITE_DISCORD_BOT_INVITE_URL` | 봇 초대 링크. 봇 초대 API가 생기기 전까지 쓰는 임시 값 |
| `VITE_PROPOSED_APIS` | BE가 구현한 "FE 요청 API" 이름을 쉼표로 나열 (`all` = 전부). 아래 [기능 플래그](#기능-플래그) 참고 |

### 3. 실행

BE 서버(`http://localhost:3001`)가 먼저 실행 중이어야 합니다.

```bash
npm run dev       # 개발 서버 → http://localhost:3000
npm run build     # 배포용 빌드 → dist/
npm run preview   # 빌드 결과 미리 보기
```

> 개발 서버 포트는 **3000으로 고정**입니다(`strictPort`). Discord OAuth 콜백 URI가 3000 포트 기준으로 등록되어 있기 때문입니다. 다른 포트를 쓰려면 BE 설정과 Discord OAuth 등록값도 같이 바꿔야 합니다.

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
3. `GET /auth/me`, `GET /auth/guilds`로 사용자·서버 목록 조회
4. 선택한 서버에 동기화 채널이 없으면 연결 설정, 있으면 대시보드로 이동

- accessToken은 `sessionStorage`에 저장됩니다(탭을 닫으면 로그아웃). 만료 2분 전에 `/auth/refresh`로 자동 갱신합니다.
- 선택한 서버 ID는 `localStorage`에 저장되어 다음 접속 때 유지됩니다.
- 토큰을 보냈는데 401이 오면 세션을 지우고 로그인 화면으로 돌아갑니다.

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

## 데모 모드

`http://localhost:3000/?demo`로 접속하면 BE 없이 샘플 데이터로 만든 프로토타입 화면을 볼 수 있습니다. 실제 API는 호출하지 않습니다.
