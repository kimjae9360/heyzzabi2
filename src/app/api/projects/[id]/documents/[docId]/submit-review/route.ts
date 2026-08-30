import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyAllPMs } from "@/lib/notify";
import { requireAuth } from "@/lib/requireAuth";

// approve/reject와 동일한 패턴의 type→컬럼명 매핑
const FIELD = { proposal: "proposalStatus", reqSpec: "reqSpecStatus" } as const;
const CONTENT_FIELD = { proposal: "proposalContent", reqSpec: "reqSpecContent" } as const;
const TYPE_LABEL = { proposal: "기획서", reqSpec: "요구사항정의서" } as const;

// AI가 생성한 초안(DRAFT)을 PM 검토 대기 상태(PENDING_REVIEW)로 전환하는 엔드포인트.
// autoApprove 없이 generate API를 호출한 경우 이 API를 거쳐야 승인/반려 흐름을 탈 수 있다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { session, error: authError } = await requireAuth();
    if (authError) return authError;

    const { docId } = await params;
    const { type } = await request.json() as { type: string };

    if (type !== "proposal" && type !== "reqSpec") {
      return NextResponse.json({ error: "type은 proposal 또는 reqSpec이어야 합니다." }, { status: 400 });
    }

    const doc = await prisma.projectDocument.findUnique({ where: { id: docId } });
    if (!doc) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }
    // 이 회의록을 시작한 사람(작성자)만 검토 요청을 보낼 수 있다 — generate API와 동일한 규칙.
    // 이 체크가 없으면 다른 팀원이 남의 초안을 대신 검토 요청 상태로 바꿀 수 있었다(실제 보고된 취약점).
    if (doc.authorId && doc.authorId !== session!.userId) {
      return NextResponse.json({ error: "다른 사용자가 시작한 회의록입니다. 작성자 본인만 검토 요청을 보낼 수 있습니다." }, { status: 403 });
    }
    // CONTENT_FIELD[type]으로 해당 문서 타입의 실제 생성 내용 컬럼을 동적으로 조회 —
    // 내용이 비어 있으면(아직 AI 생성 전) 검토 요청 자체가 성립하지 않는다
    if (!doc[CONTENT_FIELD[type]]) {
      return NextResponse.json({ error: "생성된 내용이 없어 검토 요청을 보낼 수 없습니다." }, { status: 400 });
    }
    // 초안(DRAFT) 상태에서만 검토 요청으로 전환할 수 있다 — 이 체크가 없으면 이미 검토중이거나
    // 승인된 문서에 다시 호출해 승인 상태를 조용히 검토중으로 되돌려버릴 수 있었다.
    if (doc[FIELD[type]] !== "DRAFT") {
      return NextResponse.json({ error: "이미 검토 요청되었거나 처리된 문서입니다." }, { status: 400 });
    }

    const updated = await prisma.projectDocument.update({
      where: { id: docId },
      data: { [FIELD[type]]: "PENDING_REVIEW" },
    });

    await notifyAllPMs(`"${doc.title}" ${TYPE_LABEL[type]} 검토 요청이 도착했습니다.`, { type: "info", link: "/documents" });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "검토 요청 실패" }, { status: 500 });
  }
}
