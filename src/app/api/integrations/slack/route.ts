import { NextResponse } from "next/server";

// 프로젝트 설정에서 등록한 Slack Incoming Webhook이 실제로 동작하는지 확인하는
// "연동 테스트" 엔드포인트. 실무 알림 이벤트(업무 완료 등)에서 호출되는 게 아니라,
// 사용자가 설정 화면에서 직접 눌러서 테스트 메시지를 보내볼 때 쓰인다.
export async function POST(req: Request) {
  try {
    const { webhookUrl, projectId, message } = await req.json();

    if (!webhookUrl) {
      return NextResponse.json({ error: "Webhook URL is required" }, { status: 400 });
    }

    // message가 없으면 기본 테스트 문구를 사용한다.
    const payload = {
      text: message || "🔔 *HeyZzabi 알림*\n새로운 외부 연동(Slack) 테스트 메시지입니다. 연동이 정상적으로 완료되었습니다!"
    };

    // Attempt to actually hit the webhook
    // Slack Incoming Webhook은 body를 그대로 fetch로 던지면 되는 단순 REST 호출이라
    // 별도의 Slack SDK 없이 fetch만으로 연동한다.
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: "Slack 발송 실패" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Slack Integration Error:", error);
    return NextResponse.json(
      { error: "Slack 연동 중 오류 발생" },
      { status: 500 }
    );
  }
}
