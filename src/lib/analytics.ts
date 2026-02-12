import { logEvent, setUserId, setUserProperties } from 'firebase/analytics';
import { analytics } from './firebase';

// ============================================================
// GA4 Analytics 추적 모듈
// 4가지 핵심 이벤트 카테고리:
//   1. 로그인/사용자 식별 (방문 당 1,000원 산출)
//   2. 업무 작성 퍼널 (이탈 분석)
//   3. 챗봇 활용 (AI 가치 증명)
//   4. 페이지 체류 시간 (사용자 행동 파악)
// ============================================================

// --- 1. 로그인 / 사용자 식별 ---

/**
 * 로그인 성공 시 호출: userId 설정 + login 이벤트
 */
export function trackLogin(uid: string, role: string, name: string) {
    if (!analytics) return;
    setUserId(analytics, uid);
    setUserProperties(analytics, { user_role: role, user_name: name });
    logEvent(analytics, 'login', {
        method: 'email',
        user_role: role,
    });
}

// --- 2. 업무 작성 퍼널 ---

let taskFormOpenTime: number | null = null;
let lastFieldTouched: string = '';

/**
 * 업무 생성 모달 열기 (퍼널 시작)
 */
export function trackTaskFormOpen(source: 'header' | 'board') {
    if (!analytics) return;
    taskFormOpenTime = Date.now();
    lastFieldTouched = '';
    logEvent(analytics, 'task_form_open', { source });
}

/**
 * 업무 폼 필드 입력 시작 (퍼널 단계 추적)
 */
export function trackTaskFieldTouch(fieldName: string) {
    lastFieldTouched = fieldName;
}

/**
 * 업무 저장 완료 (퍼널 완료)
 */
export function trackTaskFormSubmit(fieldsFilled: number) {
    if (!analytics) return;
    const timeSpent = taskFormOpenTime ? Math.round((Date.now() - taskFormOpenTime) / 1000) : 0;
    logEvent(analytics, 'task_form_submit', {
        total_time_sec: timeSpent,
        fields_filled: fieldsFilled,
    });
    taskFormOpenTime = null;
}

/**
 * 업무 폼 이탈 (저장 없이 닫기)
 */
export function trackTaskFormAbandon() {
    if (!analytics) return;
    if (!taskFormOpenTime) return; // 폼을 열지 않았으면 무시
    const timeSpent = Math.round((Date.now() - taskFormOpenTime) / 1000);
    logEvent(analytics, 'task_form_abandon', {
        time_spent_sec: timeSpent,
        last_field_touched: lastFieldTouched || 'none',
    });
    taskFormOpenTime = null;
}

// --- 3. 챗봇 활용 ---

/**
 * 챗봇 메시지 전송
 */
export function trackChatMessageSent(userRole: string, isRecommended: boolean) {
    if (!analytics) return;
    logEvent(analytics, 'chat_message_sent', {
        user_role: userRole,
        is_recommended: isRecommended,
    });
}

// --- 4. 페이지(뷰) 체류 시간 ---

let currentPageName: string = '';
let pageViewStartTime: number = Date.now();

/**
 * SPA 뷰 전환 시 호출: 이전 페이지 체류 시간 + 새 페이지뷰
 */
export function trackPageView(pageName: string) {
    if (!analytics) return;

    // 이전 페이지 체류 시간 기록
    if (currentPageName) {
        const timeSpent = Math.round((Date.now() - pageViewStartTime) / 1000);
        if (timeSpent > 0) {
            logEvent(analytics, 'page_leave', {
                page_name: currentPageName,
                time_spent_sec: timeSpent,
            });
        }
    }

    // 새 페이지 기록
    currentPageName = pageName;
    pageViewStartTime = Date.now();
    logEvent(analytics, 'page_view_custom', {
        page_name: pageName,
    });
}
