import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { webhookUrl, projectId, message } = await req.json();

    if (!webhookUrl) {
      return NextResponse.json({ error: "Webhook URL is required" }, { status: 400 });
    }

    const payload = {
      text: message || "🔔 *HeyZzabi 알림*\n새로운 외부 연동(Slack) 테스트 메시지입니다. 연동이 정상적으로 완료되었습니다!"
    };

    // Attempt to actually hit the webhook
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
