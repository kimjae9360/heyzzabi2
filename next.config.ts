import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse(내부적으로 pdfjs-dist 사용)는 워커 파일/DOMMatrix 같은 브라우저 API를 내부에서
  // 직접 resolve하는 방식이라, Next.js가 API 라우트 코드를 번들링하면서 건드리면
  // "worker 모듈을 못 찾음"(로컬) / "DOMMatrix is not defined"(Vercel 서버리스) 에러가 났다
  // (PDF 첨부 시 파싱이 조용히 실패하던 실제 버그) — 번들링 대상에서 빼고 node_modules에서
  // 그대로 require하게 하면 패키지 내부 상대경로/워커 resolve가 깨지지 않는다.
  // @napi-rs/canvas는 플랫폼별 네이티브(.node) 바이너리를 require()로 직접 불러오는 방식이라
  // Turbopack이 ESM 청크로 번들링하려 하면 "non-ecmascript placeable asset" 에러로 빌드가
  // 통째로 실패한다(PDF의 DOMMatrix 폴리필용으로 새로 끌어온 의존성) — pdf-parse와 마찬가지로
  // 번들링 대상에서 빼고 node_modules에서 그대로 require하게 해야 한다.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
};

export default nextConfig;
