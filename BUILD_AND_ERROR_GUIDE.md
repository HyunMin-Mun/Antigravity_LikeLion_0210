# 🛠️ 빌드 가이드 및 트러블슈팅 매뉴얼

본 문서는 `WorkFlow` 프로젝트의 안정적인 빌드 환경 구축과 개발 과정에서 마주칠 수 있는 예외 상황에 대한 해결책을 제공합니다.

---

## 🏗️ 1. 개발 및 빌드 환경 (Setup & Build)

### 1.1 필수 요구 사항
- **Node.js**: lts/iron (v20) 이상 권장
- **Package Manager**: npm

### 1.2 명령어 모음
| 명령어 | 용도 |
| :--- | :--- |
| `npm run dev` | 로컬 개발 서버(Vite) 실행 (localhost:5173) |
| `npm run build` | 프로덕션용 최적화 빌드 (dist/ 생성) |
| `npm run preview` | 빌드된 결과물 로컬 미리보기 |
| `npm run lint` | 코드 정적 분석 및 컨벤션 체크 |

---

## ✅ 2. 품질 체크리스트 (Quality Checklist)

배포 전 다음 항목을 확인하여 시스템의 안정성을 확보하십시오.

- [x] **Firebase 연동**: `src/lib/firebase.ts`의 설정이 유효하며 Firestore 통신이 원활한가.
- [x] **화면 로컬라이제이션**: 모든 텍스트가 한국어로 표시되며 폰트 끊김 현상이 없는가.
- [x] **인증 흐름**: 로그인/회원가입 후 역할(`manager`/`member`)에 따른 접근 제한이 올바른가.
- [x] **실시간 동기화**: 한 브라우저에서 수정된 데이터가 다른 세션에 즉시 반영되는가.
- [ ] **API 키 보안**: 현재 코드 내에 포함된 Firebase/AI API 키를 `.env` 파일로 분리했는가. (향후 과제)
- [ ] **성능 벤치마크**: 50개 이상의 업무 카드 렌더링 시 Framerate 저하가 없는가.

---

## 🚨 3. 예외 사례 및 해결 (Troubleshooting)

이력 기반의 핵심 실패 사례와 그 대응법입니다.

### 3.1 Firebase Auth 레이스 컨디션 (CRITICAL)
- **현상**: 신규 가입 직후 "User document not found" 에러 메시지 발생.
- **원인**: Auth 계정은 생성되었으나 Firestore의 `users` 문서 생성 전 리스너가 먼저 트리거됨.
- **해결**: `App.tsx` 내 `useEffect`에서 문서 부재 시 1.5초 대기 후 재시도하는 로직 적용 완료.

### 3.2 데모 로그인 400 에러 및 사용자 부재
- **현상**: 데모 로그인 버튼 클릭 시 계정 부재로 로그인 실패.
- **해결**: `handleDemoLogin` 함수 내부에 `signIn` 실패 시 `createUser`를 자동 수행하는 **'Auto-Provisioning'** 로직 구현.

### 3.3 TypeScript 인터페이스 불일치
- **현상**: 빌드 시 `WorkItem` 관련 타입 에러 발생.
- **원인**: Firebase 데이터 구조와 `interface` 정의의 필드 명 불일치 (`assignee` vs `assignees` 등).
- **해결**: 모든 필드를 `assignees: string[]` 배열 구조로 통일하여 해결.

---

## 💡 4. 운영 및 디버깅 팁
- **Firestore Console**: 데이터 상태를 코드로만 보지 말고 Firebase Console에서 직접 구조를 모니터링하십시오.
- **Agentic Debugging**: AI 에이전트에게 버그 리포트를 줄 때는 브라우저 Console의 전체 에러 로그를 복사하여 제공하면 해결 속도가 빨라집니다.
- **State Cleanup**: `useEffect` 내의 리얼타임 리스너(`onSnapshot`)가 컴포넌트 언마운트 시 정상적으로 `unsubscribe` 되는지 항상 확인하십시오.
