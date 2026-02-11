# WorkFlow MVP - 프로젝트 명세 및 개발 현황

## [역할 및 페르소나]
- **시니어 풀스택 엔지니어 및 프로덕트 디자이너**: 고성능 논리 구조와 프리미엄 UX/UI를 결합하여 기업용 MVP를 구축합니다.

## [프로젝트 목표]
- **핵심 가치**: "누가 어떤 일을 하는지 묻지 않아도 데이터와 AI가 알려주는 환경"
- **대상**: 동시에 다수의 프로젝트를 수행하는 전문 협업 팀.
- **통합 영역**: 업무 가시성(Visibility), 보고(Reporting), 승인(Approval).

---

## [기술 스택]
- **Frontend**: React + TypeScript + TailwindCSS (v4)
- **Icons**: Lucide-react
- **State Management**: React `useState`/`useEffect` 기반의 In-memory State + **Firebase Firestore** 연동 중
- **Backend/DB**: **Firebase (Auth, Firestore, Analytics)**
- **AI Integration**: Gemini 2.0 Flash API (전략적 분석 및 업무 조정 제안용)
- **Design System**: Indigo & White 기반의 프리미엄 UI, 고도화된 그림자(Shadows) 및 라운딩(rounded-3xl) 적용.

---

## [최신 업데이트 사항 (v0.5)]
1. **완벽한 한국어 로컬라이제이션**: 모든 UI 텍스트, 필터 라벨, 모달 항목, 챗봇 응답이 한국어로 제공됩니다.
2. **뷰 상태 유지 (Persistence)**: 팀 업무 보드의 '칸반'과 '리스트' 뷰 상태가 App 전역 상태로 관리되어, 페이지 이동이나 상세 보기 후에도 이전 뷰가 그대로 유지됩니다.
3. **담당 멤버 가시성 강화**:
    - **칸반/리스트**: 아바타 옆에 담당자 이름 노출.
    - **멀티 셀렉트**: 업무 상세 모달에서 클릭 한 번으로 여러 명의 팀원을 배정/해제 가능.
    - **기본값**: 신규 업무 생성 시 현재 로그인한 사용자가 기본 담당자로 지정됨.
4. **인증 시스템 복구**: 회원가입 기능과 데모용 퀵 로그인 기능이 복구 및 고도화되었습니다.

---

## [핵심 페이지 및 기능]

### A. 인증 시스템 (Auth)
- **회원가입/로그인**: 로컬 유저 객체 생성 및 세션 관리.
- **데모 편의**: '멤버 모드(Member)', '매니저 모드(Manager)' 버튼으로 즉시 테스트 가능.

### B. 내 대시보드 (신규: 개인 전략 보기)
- **통계**: 배정된 업무, 진행 중인 업무, 고영향도 업무 수치 시각화.
- **집중 큐**: 전략적 우선순위가 높은 순으로 본인의 할당 업무 리스트업.

### C. 팀 업무 보드 (Team Board)
- **뷰 모드 토글**: '칸반 보드'와 '리스트 뷰' 간 실시간 전환.
- **지능형 필터**: 프로젝트 클러스터, 담당자, 상태 기반의 복합 필터링.
- **업무 카드**: 우선순위 스코어(PTS), 마감 D-day, 담당자 이름 및 아바타 노출.

### D. 업무 상세 (Modal)
- **데이터 확정**: 제목, 프로젝트, 유형, 전략적 설명, 날짜, 상태, 영향도, 긴급도 필드 편집.
- **전술 정보**: "최신 전술 정보" 섹션을 통해 현재 진행 상황 실시간 공유.

### E. 전략 우선순위 엔진 (Priority Engine)
- **수학적 계산**: Impact(영향도), Urgency(긴급도), Deadline(마감) 가중치를 합산하여 `priority_score` 자동 산출.
- **AI 인텔리전스**: 시스템 라이브 시뮬레이션을 통해 주간 전략 리포트 및 리스크 분석 제공.

### F. 승인 인박스 (Manager Only)
- AI가 제안한 인력 재배치나 회의 통합 등의 제안(Proposal)을 검토하고 승인/반려.

### G. AI 전략 어시스턴트 (Chat Panel)
- **페르소나**: 분석적이고 제안 중심적인 전략 보조원.
- **기능**: 팀 업무 데이터 분석, 리스크 요인 식별, 우선순위 재조정 제안.

## [데이터 아키텍처 및 시스템 엔진]

### 1. 데이터 베이스 상세 명세 (Firebase Firestore)
현재 시스템은 In-memory 기반에서 **Firebase Firestore**로의 데이터 영속성 전환을 진행 중입니다.

- **Firestore Collections**:
    - `users`: 사용자 프로필 및 권한 정보
    - `workItems`: 전체 프로젝트 업무 데이터
    - `proposals`: AI가 생성한 제안 데이터

- **User (사용자)**:
    - `id: string`: 고유 식별자
    - `name: string`: 이름
    - `email: string`: 로그인 이메일
    - `role: Role`: 권한 ('member' | 'manager')
    - `today_status: string`: 근무 상태 표시 (근무/재택/외근 등)
    - `password?: string`: 인증 비밀번호 (MVP용)

- **WorkItem (업무)**:
    - `id: string`: 고유 식별자
    - `project_name: string`: 소속 프로젝트 클러스터 명
    - `title: string`: 업무 제목
    - `description: string`: 전략적 상세 설명
    - `type: WorkType`: 작업 유형 (개발/기획/디자인/문서 등)
    - `assignees: string[]`: 담당자 ID 배열 (멀티 배정 지원)
    - `requester: string`: 요청자 ID
    - `due_date: string`: 마감일 (YYYY-MM-DD)
    - `status: Status`: 진행 상태 (준비/진행/완료)
    - `impact: Level`: 전략적 영향도 (low/med/high)
    - `urgency: Level`: 긴급도 (low/med/high)
    - `priority_score: number`: 가중치 기반 계산된 우선순위 점수
    - `approval_status: ApprovalStatus`: 승인 상태 (none/pending/approved/rejected)
    - `last_update_note: string`: 최근 공유된 전술 업데이트 정보

- **Proposal (AI 제안)**:
    - `id: string`: 고유 식별자
    - `suggestion_text: string`: 제안 요약
    - `explanation: string`: 제안 근거 설명
    - `created_at: string`: 생성 일시
    - `created_by: string`: 생성 주체 (AI/User)
    - `approval_status: ApprovalStatus`: 승인 여부

---

## [이 문서를 활용한 코드 파악 가이드]

본 프로젝트를 분석하거나 코드를 검증할 때 이 문서를 **'지도(Map)'**로 활용할 수 있습니다. 각 섹션은 코드의 다음 부분과 1:1로 매칭됩니다:

1.  **데이터 모델 섹션** ⇄ `App.tsx` 상단의 `interface` 및 `type` 정의부
2.  **우선순위 산출 로직** ⇄ `App.tsx` 내 `getPriorityScore` 함수
3.  **핵심 페이지 및 기능** ⇄ `App.tsx` 내 각 컴포넌트 (`BoardPage`, `MyPage`, `PriorityPage` 등)
4.  **인증 시스템** ⇄ `AuthView` 컴포넌트 및 `handleLogin`/`handleSignup` 핸들러

**💡 팁**: 새로운 기능을 추가할 때마다 이 문서의 **[최신 업데이트 사항]**과 **[데이터 모델]**을 먼저 확인하면, 전체 시스템의 논리적 일관성을 깨뜨리지 않고 안전하게 코딩할 수 있습니다.

### 2. 우선순위 산출 로직 (Priority Engine)
각 업무의 우선순위는 다음과 같은 수학적 산식에 의해 실시간으로 계산됩니다:
`Score = (영향도 가중치) + (긴급도 가중치) + (마감일 임박도 가중치)`
- 매니저는 설정에서 각 지표의 가중치를 조절하여 팀 전체의 업무 우선순위 파이프라인을 재배열할 수 있습니다.

---

## [접근 및 배포 안내]

### 1. 로컬 개발 환경 주소
- **URL**: `http://localhost:5173`
- **실행 명령**: `npm run dev`

### 2. Firebase 배포 주소 (Hosting)
- **메인 접속 URL**: `https://antigravity-0211.web.app` (또는 `https://antigravity-0211.firebaseapp.com`)
- **특징**: 전 세계 어디서나 위 주소로 접속하여 실시간 협업이 가능합니다.

---

## 🚨 [자주 묻는 질문 및 트러블슈팅]

### Q1. 데모 계정(멤버/매니저 모드) 클릭 시 400 에러가 발생합니다.
- **원인**: Firebase 프로젝트는 보안상 계정이 존재해야만 로그인이 가능합니다. 현재 Firebase Auth에 해당 이메일들이 등록되어 있지 않아 발생하는 현상입니다.
- **해결책**: 
    1. 직접 '회원가입' 탭에서 `young@example.com` 등의 이메일로 가입을 한 번 진행해주세요.
    2. 또는 Firebase Console의 **Authentication** 메뉴에서 사용자 추가를 통해 `young@example.com` (비밀번호: 123) 계정을 수동으로 생성해주시면 버튼이 정상 작동합니다.

### Q2. 로그인 후 업무 정보가 하나도 안 보입니다.
- **원인**: 새로운 데이터베이스(`Firestore`)로 연동되면서 기존 로컬 샘플 데이터가 아닌, 실제 리얼타임 데이터 저장소를 바라보게 되었습니다. 현재 DB가 비어있는 상태입니다.
- **해결책**: 우측 상단의 **[+ 업무 추가]** 버튼을 통해 첫 번째 업무를 등록해보세요. 등록하는 즉시 실시간으로 DB에 저장됩니다.

---

## [완료 기준 (Definition of Done)]
- [x] 칸반/리스트 뷰 전환 및 상태 유지.
- [x] 모든 UI의 한국어 번역 및 가독성 확보.
- [x] 담당자 멀티 선택 및 이름 노출 기능.
- [x] 신규 업무 추가 및 기존 업무 수정 기능 (CRUD).
- [x] 새로고침 전까지 모든 데이터의 논리적 무결성 유지.
