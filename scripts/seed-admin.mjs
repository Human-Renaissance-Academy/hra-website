/**
 * 관리자 계정 시드 스크립트
 *
 * 최초 관리자 계정을 DB에 생성합니다.
 * bcrypt로 비밀번호를 해싱하여 안전하게 저장합니다.
 *
 * 사용법:
 *   npm run seed-admin -- --confirm-create
 *   npm run seed-admin -- --confirm-promote=기존계정이메일
 *
 * 환경변수:
 *   DATABASE_URL - Neon Postgres 연결 문자열 (필수)
 *   ADMIN_EMAIL  - 관리자 이메일 (기본값: admin@hra.ac.kr)
 *   ADMIN_PASSWORD - 관리자 비밀번호 (기본값: 없음, 반드시 설정)
 *   ADMIN_NAME   - 관리자 이름 (기본값: 관리자)
 */

import { neon } from "@neondatabase/serverless";
import { hash } from "bcryptjs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL 환경변수가 설정되지 않았습니다.");
  console.error("   .env 파일에 DATABASE_URL을 추가하거나 환경변수로 전달하세요.");
  process.exit(1);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@hra.ac.kr";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || "관리자";
const args = new Set(process.argv.slice(2));

// 확인 인자 없이 실행하면 DB 조회 전 중단해 잘못된 대상 연결도 피합니다.
if (!args.has("--confirm-create") && !args.has(`--confirm-promote=${ADMIN_EMAIL}`)) {
  console.error("❌ --confirm-create 또는 --confirm-promote=대상이메일 인자가 필요합니다.");
  process.exit(1);
}

if (!ADMIN_PASSWORD) {
  console.error("❌ ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.");
  console.error("   사용 예시:");
  console.error(
    '   ADMIN_PASSWORD="your-secure-password" npm run seed-admin'
  );
  process.exit(1);
}

async function seedAdmin() {
  const sql = neon(DATABASE_URL);

  console.log(`\n🔐 관리자 계정 생성 중...`);
  console.log(`   이메일: ${ADMIN_EMAIL}`);
  console.log(`   이름: ${ADMIN_NAME}`);

  // 기존 사용자 확인
  const existing = await sql`SELECT id, role, session_version FROM users WHERE email = ${ADMIN_EMAIL}`;

  if (existing.length > 0) {
    if (existing[0].role === "ADMIN") {
      console.log(`\n⚠️  이미 관리자 계정이 존재합니다 (${ADMIN_EMAIL}).`);
      console.log("   비밀번호 변경 시 DB의 같은 UPDATE 문장에서 password_hash 수정과 session_version = session_version + 1을 함께 적용하세요.");
      process.exit(0);
    }

    // 기존 계정 승격은 대상 이메일을 명시한 확인 인자가 있을 때만 허용합니다.
    if (!args.has(`--confirm-promote=${ADMIN_EMAIL}`)) {
      throw new Error(`기존 ${existing[0].role} 계정의 승격이 중단되었습니다. --confirm-promote=${ADMIN_EMAIL} 인자가 필요합니다.`);
    }

    // 역할·세션 버전을 함께 확인해 조회 후 다른 변경이 있으면 덮어쓰지 않습니다.
    const passwordHash = await hash(ADMIN_PASSWORD, 12);
    const promoted = await sql`
      UPDATE users
      SET role = 'ADMIN', password_hash = ${passwordHash},
          session_version = session_version + 1, updated_at = NOW()
      WHERE id = ${existing[0].id}
        AND role = ${existing[0].role}
        AND session_version = ${existing[0].session_version}
      RETURNING id
    `;
    if (promoted.length !== 1) {
      throw new Error("계정 정보가 변경되어 승격을 중단했습니다. 다시 조회한 뒤 확인해 주세요.");
    }
    console.log(`\n✅ 기존 계정을 관리자로 승격했습니다.`);
    process.exit(0);
  }

  // 새 관리자 생성도 명시적인 확인 인자가 있어야 실행합니다.
  if (!args.has("--confirm-create")) {
    throw new Error("새 관리자 계정 생성을 중단했습니다. --confirm-create 인자가 필요합니다.");
  }
  const passwordHash = await hash(ADMIN_PASSWORD, 12);
  await sql`
    INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
    VALUES (${ADMIN_NAME}, ${ADMIN_EMAIL}, ${passwordHash}, 'ADMIN', NOW(), NOW())
  `;

  console.log(`\n✅ 관리자 계정이 생성되었습니다!`);
  console.log(`   이메일: ${ADMIN_EMAIL}`);
  console.log(`   역할: ADMIN`);
  console.log(`\n   이제 로그인 페이지에서 이메일/비밀번호로 로그인할 수 있습니다.`);
}

seedAdmin().catch((err) => {
  console.error("\n❌ 관리자 계정 생성 실패:", err.message);
  process.exit(1);
});
