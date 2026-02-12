# 🚀 WorkFlow - 전략적 가시성 플랫폼 (Strategic Visibility Platform)

본 프로젝트는 "누가 어떤 일을 하는지 묻지 않아도 데이터와 AI가 알려주는 환경"을 목표로 개발된 기업용 MVP입니다.

---

## 🏗️ 1. 프로젝트 개요 및 비전 (Vision & History)

### 1.1 핵심 가치 (Core Values)
- **Zero-Question Visibility**: AI가 프로젝트 데이터를 실시간 분석하여 팀원 간의 질문 공백을 제거합니다.
- **Strategic Impact**: 단순한 할 일이 아닌, 비즈니스 영향도(Impact)와 긴급도(Urgency)를 기반으로 한 의사결정을 지원합니다.
- **Premium Experience**: Indigo & White 기반의 고도화된 디자인 시스템(Tailwind v4)을 통해 전문가 수준의 UX를 제공합니다.

### 1.2 시스템 여정 (Journey of Evolution)
1.  **Phase 1 (Foundation)**: Indigo 테마와 Lucide 아이콘을 활용한 고해상도 UI 레이아웃 구축.
2.  **Phase 2 (Intelligence)**: 영향도, 긴급도, 마감일을 결합한 **Priority Engine** 알고리즘 최적화.
3.  **Phase 3 (Persistence)**: In-memory 상태에서 **Firebase Firestore** 실시간 연동으로 데이터 영속성 확보.
4.  **Phase 4 (Localization & UX)**: 모든 UI의 완벽한 한국어화 및 칸반/리스트 뷰 상태 유지(View Persistence) 구현.
5.  **Phase 5 (Reliability)**: 인증 과정의 레이스 컨디션 해결 및 데모 계정 자동 생성 로직을 통한 테스트 안정성 확보.

---

## 🛠️ 2. 기술 스택 및 아키텍처 (Technical Stack)

| 구분 | 기술 | 상세 내용 |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript | 엄격한 타입 체크 및 함수형 컴포넌트 기반 |
| **Bundler** | Vite | 현대적인 프론트엔드 빌드 도구 |
| **Styling** | TailwindCSS v4 | 프리미엄 커스텀 디자인 시스템 (`rounded-3xl`, `shadow-2xl`) |
| **Backend** | Firebase | Auth(인증), Firestore(실시간 DB), Hosting |
| **AI** | Gemini 2.0 Flash | 전략적 분석 및 리스크 식별을 위한 전략 어시스턴트 |
| **Language** | Korean (KO) | UI 텍스트 및 AI 페르소나의 완벽한 로컬라이제이션 |

---

## 📊 3. 데이터 모델 및 시스템 로직 (Data & Logic)

### 3.1 전략 우선순위 엔진 (Priority Engine)
업무의 우선순위 점수(`priority_score`)는 다음 산식에 의해 실시간 계산됩니다:
- **영향도(Impact)**: Low(1), Med(2), High(3) × 가중치
- **긴급도(Urgency)**: Low(1), Med(2), High(3) × 가중치
- **마감 임박도(Deadline)**: `10 / 남은 일수` × 가중치
- *관리자는 가중치(Weights) 설정을 통해 팀의 전략적 방향을 즉시 변경할 수 있습니다.*

### 3.2 주요 데이터 스키마
- **Users**: 사용자 역할(`member` \| `manager`), 근무 상태(`today_status`) 관리.
- **WorkItems**: 프로젝트 클러스터링, 멀티 담당자 배정, 승인 상태(`approval_status`) 관리.
- **Proposals**: AI가 생성한 인력 고도화 및 리스크 대응 제안 정보.

---

## 🤖 4. AI 에이전트를 위한 맥락 가이드 (For AI Agents)

이 섹션은 보조 개발자로 참여하는 AI(Gemini, Claude, Cursor 등)가 일관된 맥락을 유지하기 위한 핵심 지침입니다.

### 4.1 유지해야 할 컨텍스트 (Contextual Continuity)
- **모놀리식 구조의 이해**: 현재 대부분의 기능이 `src/App.tsx`에 통합되어 있습니다. 수정 시 파일의 상부에서 변수/타입 정의를 먼저 확인하십시오.
- **디자인 원칙**: `rounded-2xl` 이상의 큰 라운딩과 `shadow-indigo-100`과 같은 은은한 그림자를 적극적으로 사용하십시오.
- **비로그인 대응**: 사용자가 인증되지 않은 상태에서는 `AuthView`로 즉시 리다이렉트되어야 합니다.

### 4.2 주요 트러블슈팅 사례 (Failure Logs)
- **Auth Race Condition**: 회원가입 직후 Firestore 문서 생서 지연 문제를 해결하기 위해 1.5초의 대기 로직이 적용되어 있습니다. 이를 무모하게 제거하지 마십시오.
- **Demo Login Logic**: `member@demo.ai`와 `manager@demo.ai` 계정은 로그인 시도 실패 시 즉시 자동 생성되어야 테스트 유동성이 유지됩니다.

---

## 🚀 5. 향후 로드맵 (Roadmap)

1.  **컴포넌트 분리 (Refactoring)**: `App.tsx`를 기능별 컴포넌트로 분리하여 유지보수성 향상.
2.  **AI 분석 고도화**: 대화형 챗봇을 넘어, 시스템이 스스로 리스크를 탐지하여 푸시 알림을 보내는 '에이전틱 옵저버' 기능 개발.
3.  **다크 모드 익스텐션**: 프리미엄 톤앤매너를 유지하는 고도화된 다크 모드 지원.
4.  **팀 스페이스 확장**: 여러 팀이 독립적인 공간에서 작업할 수 있는 멀티 테넌트 구조로 확장.

---

## 💡 [인수인계 및 참고 사항]
- 본 문서는 시니어 테크니컬 라이터에 의해 작성되었으며, 코드 수정 시 반드시 이 문서의 **[2. 여정]** 및 **[4. AI 가이드]** 섹션을 먼저 읽고 작업에 임해 주십시오.
