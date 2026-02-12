import { GoogleGenerativeAI } from "@google/generative-ai";

// Google AI Studio 직접 API 키 방식 (Firebase AI SDK 대신)
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
});

/**
 * 전략 어시스턴트 AI 응답 생성
 * @param userMessage 사용자 입력 메시지
 * @param context 현재 업무/사용자 컨텍스트 (시스템 프롬프트에 포함)
 * @param managerDirectives 매니저가 학습시킨 전략 방향성 (선택)
 * @returns AI 응답 텍스트
 */
export async function generateStrategyResponse(
    userMessage: string,
    context: {
        userName: string;
        totalTasks: number;
        highImpactTasks: number;
        inProgressTasks: number;
        todoTasks: number;
        doneTasks: number;
        projectNames: string[];
        upcomingDeadlines: { title: string; dueDate: string }[];
    },
    managerDirectives?: string[]
): Promise<string> {
    const directivesSection = managerDirectives && managerDirectives.length > 0
        ? `\n\n## 매니저 전략 방향성 (반드시 이 맥락을 참고하여 답변)\n${managerDirectives.map((d, i) => `${i + 1}. ${d}`).join("\n")}`
        : "";

    const systemPrompt = `당신은 "WorkFlow" 전략적 가시성 플랫폼의 AI 전략 어시스턴트입니다.

## 역할
- 팀의 업무 현황을 분석하고 전략적 인사이트를 제공합니다.
- 우선순위 재조정, 리스크 식별, 리소스 배분을 제안합니다.
- 항상 한국어로 답변합니다.
- 답변은 간결하고 실행 가능한 제안 중심으로 합니다 (최대 3-4문장).
${directivesSection}

## 현재 팀 현황
- 사용자: ${context.userName}
- 전체 업무: ${context.totalTasks}개
- 고영향도 업무: ${context.highImpactTasks}개
- 진행 중: ${context.inProgressTasks}개 | 준비: ${context.todoTasks}개 | 완료: ${context.doneTasks}개
- 활성 프로젝트: ${context.projectNames.join(", ") || "없음"}
- 임박한 마감: ${context.upcomingDeadlines.length > 0 ? context.upcomingDeadlines.map(d => `"${d.title}" (${d.dueDate})`).join(", ") : "없음"}

위 데이터를 기반으로 전략적이고 실용적인 답변을 제공하세요.`;

    try {
        const result = await model.generateContent({
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: systemPrompt + "\n\n사용자 질문: " + userMessage },
                    ],
                },
            ],
        });

        const response = result.response;
        const text = response.text();
        return text || "분석을 완료했지만 결과를 생성하지 못했습니다. 다시 시도해 주세요.";
    } catch (error: any) {
        console.error("Gemini API 호출 실패:", error);

        if (error?.message?.includes("API key")) {
            return "⚠️ AI API 키가 유효하지 않습니다. 관리자에게 문의해 주세요.";
        }
        if (error?.message?.includes("quota") || error?.message?.includes("429")) {
            return "⚠️ AI 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
        }
        if (error?.message?.includes("network") || error?.message?.includes("fetch")) {
            return "⚠️ 네트워크 연결을 확인해 주세요.";
        }

        return "⚠️ AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
    }
}

/**
 * AI 학습 채팅 — 매니저가 AI에게 방향성을 입력하면 요약하여 반환
 */
export async function processLearningInput(
    managerInput: string,
    existingDirectives: string[]
): Promise<string> {
    const prompt = `당신은 "WorkFlow" 전략적 가시성 플랫폼의 AI 학습 모듈입니다.

## 기존 학습된 방향성
${existingDirectives.length > 0 ? existingDirectives.map((d, i) => `${i + 1}. ${d}`).join("\n") : "아직 학습된 방향성이 없습니다."}

## 매니저의 새로운 입력
"${managerInput}"

## 작업
매니저가 입력한 내용을 한 줄의 명확한 전략 방향성으로 요약해주세요.
- 핵심 키워드와 실행 가능한 지시로 압축
- 50자 이내로 요약
- 요약문만 출력 (부가 설명 없이)`;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
        return result.response.text().trim();
    } catch (error: any) {
        console.error("AI 학습 처리 실패:", error);
        throw error;
    }
}
