export const EMAIL_DOMAIN = "heyzzabi.com";

export const DEPARTMENTS = ["개발팀", "디자인팀", "기획팀", "QA팀", "마케팅팀", "인사팀", "영업팀"] as const;

export const POSITIONS = ["사원", "주임", "대리", "과장", "차장", "부장", "이사"] as const;

export const JOB_TITLES = [
  "Frontend",
  "Backend",
  "Full-stack",
  "DevOps",
  "UI/UX Designer",
  "Project Manager",
  "QA Engineer",
  "Data Engineer",
] as const;

export const SKILL_SUGGESTIONS = [
  "React", "Next.js", "TypeScript", "JavaScript", "Vue", "Angular", "HTML", "CSS", "Tailwind CSS",
  "Node.js", "Express", "NestJS", "Python", "Django", "FastAPI", "Java", "Spring", "Kotlin",
  "Go", "Rust", "PHP", "C#", ".NET",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "GraphQL", "REST API", "Prisma",
  "Docker", "Kubernetes", "AWS", "GCP", "Azure", "Terraform", "CI/CD", "Linux",
  "Figma", "Sketch", "Illustrator", "Photoshop", "Prototyping", "UX Research", "Design System",
  "Git", "Jest", "Cypress", "Selenium", "Agile", "Scrum", "JIRA",
  "iOS", "Android", "React Native", "Flutter",
  "Data Analysis", "SQL", "Pandas", "TensorFlow", "PyTorch",
] as const;

export const CERT_SUGGESTIONS = [
  "정보처리기사", "정보처리산업기사", "정보보안기사", "정보보안산업기사",
  "SQLD", "SQLP", "ADsP", "빅데이터분석기사",
  "AWS Solutions Architect", "AWS Developer Associate", "AWS SysOps Administrator",
  "GCP Associate Cloud Engineer", "Azure Fundamentals",
  "PMP", "CISSP", "OCJP",
  "GTQ", "GTQi", "컴퓨터활용능력 1급", "컴퓨터활용능력 2급", "ITQ",
  "리눅스마스터", "네트워크관리사", "CCNA",
] as const;

export const PROJECT_SUGGESTIONS = [
  "헤이 짜비(Hey Zzabi)", "사내 ERP 구축", "사내 그룹웨어 고도화", "모바일 앱 리뉴얼", "데이터 파이프라인 구축",
] as const;

export const STATUS_META: Record<string, { label: string; badgeClass: string; selectClass: string }> = {
  ACTIVE: { label: "활성", badgeClass: "bg-emerald-500/10 text-emerald-500", selectClass: "text-emerald-500 border-emerald-500/30" },
  LEAVE: { label: "휴직", badgeClass: "bg-amber-500/10 text-amber-500", selectClass: "text-amber-500 border-amber-500/30" },
  RESIGNED: { label: "퇴사", badgeClass: "bg-gray-500/10 text-gray-400", selectClass: "text-gray-400 border-gray-500/30" },
  LOCKED: { label: "잠금", badgeClass: "bg-red-500/10 text-red-500", selectClass: "text-red-500 border-red-500/30" },
};
