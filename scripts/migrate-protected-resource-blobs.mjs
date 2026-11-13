/**
 * 자료실 DB가 참조하는 공개 Blob을 비공개 저장소로 이전합니다 (#101).
 * 기본 실행은 참조 개수만 읽습니다. --apply는 바이트를 비교한 뒤 DB 참조를 조건부로 바꾸고,
 * --delete-public은 새 업로드가 비공개로 전환된 상태에서 미참조 공개 원본만 삭제합니다.
 */
import { createHash, randomUUID } from "node:crypto";
import { del, get, head, put } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

const publicHost = "4sompt13gxwuz2x8.public.blob.vercel-storage.com";
const protectedPrefixes = [
  "class-materials/",
  "guidebooks/",
  "weekly-texts/",
  "class-logs/",
  "weekly-text-images/",
  "resource-uploads/class-materials/",
  "resource-uploads/guidebooks/",
  "resource-uploads/weekly-texts/",
];
const args = process.argv.slice(2);
if (
  args.some((arg) => !["--apply", "--delete-public"].includes(arg)) ||
  (args.includes("--apply") && args.includes("--delete-public"))
) {
  throw new Error("--apply 또는 --delete-public 중 하나만 지정할 수 있습니다.");
}
const apply = args.includes("--apply");
const deletePublic = args.includes("--delete-public");
const privateHost = process.env.RESOURCE_PRIVATE_BLOB_HOST;
const privateToken = process.env.RESOURCE_PRIVATE_READ_WRITE_TOKEN;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL이 필요합니다.");
if (!privateHost || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(privateHost)) {
  throw new Error("자료 참조 점검에는 RESOURCE_PRIVATE_BLOB_HOST가 필요합니다.");
}
if ((apply || deletePublic) && !privateToken) {
  throw new Error("비공개 저장소 연결이 필요합니다.");
}
if ((apply || deletePublic) && process.env.RESOURCE_PRIVATE_BLOB_ENABLED !== "true") {
  throw new Error("새 업로드를 비공개 저장소로 전환한 뒤 이전해야 합니다.");
}

const sql = neon(process.env.DATABASE_URL);
const privateStoreId = privateHost?.split(".")[0];

function accessOf(url) {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname === "/"
    )
      return "unknown";
    if (parsed.hostname === publicHost) return "public";
    if (parsed.hostname === privateHost) return "private";
  } catch {
    // DB의 빈 값이나 비정상 URL은 외부에서 읽지 않습니다.
  }
  return "unknown";
}

async function resourceRows() {
  return sql`
    SELECT 'class_materials' AS kind, id, file_url AS url FROM class_materials
    UNION ALL SELECT 'guidebooks', id, file_url FROM guidebooks
    UNION ALL SELECT 'weekly_texts', id, file_url FROM weekly_texts WHERE file_url <> ''
    UNION ALL SELECT 'weekly_text_images', id, url FROM weekly_text_images
    UNION ALL SELECT 'class_log_images', id, url FROM class_log_images
  `;
}

async function updateReference(row, privateUrl) {
  // URL까지 WHERE에 포함해 운영 중 행이 바뀌면 덮어쓰지 않습니다.
  if (row.kind === "class_materials")
    return sql`
    UPDATE class_materials SET file_url = ${privateUrl}
    WHERE id = ${row.id} AND file_url = ${row.url} RETURNING id`;
  if (row.kind === "guidebooks")
    return sql`
    UPDATE guidebooks SET file_url = ${privateUrl}
    WHERE id = ${row.id} AND file_url = ${row.url} RETURNING id`;
  if (row.kind === "weekly_texts")
    return sql`
    UPDATE weekly_texts SET file_url = ${privateUrl}
    WHERE id = ${row.id} AND file_url = ${row.url} RETURNING id`;
  if (row.kind === "weekly_text_images")
    return sql`
    UPDATE weekly_text_images SET url = ${privateUrl}
    WHERE id = ${row.id} AND url = ${row.url} RETURNING id`;
  if (row.kind === "class_log_images")
    return sql`
    UPDATE class_log_images SET url = ${privateUrl}
    WHERE id = ${row.id} AND url = ${row.url} RETURNING id`;
  throw new Error("알 수 없는 자료 종류입니다.");
}

async function copyAndSwap(row) {
  const original = await head(row.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
  if (original.url !== row.url || original.size < 1 || original.size > 100 * 1024 * 1024) {
    throw new Error("공개 원본의 크기를 확인할 수 없습니다.");
  }
  const response = await fetch(row.url, { redirect: "error", cache: "no-store" });
  if (!response.ok) throw new Error("공개 원본을 읽을 수 없습니다.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== original.size) throw new Error("공개 원본의 크기가 일치하지 않습니다.");

  const suffix = /\.[a-z0-9]{1,8}$/i.exec(new URL(row.url).pathname)?.[0] ?? ".bin";
  const blob = await put(
    `protected-migration/${row.kind}/${row.id}-${randomUUID()}${suffix}`,
    bytes,
    {
      access: "private",
      token: privateToken,
      contentType: original.contentType,
    },
  );
  let swapAttempted = false;
  try {
    if (new URL(blob.url).hostname !== privateHost)
      throw new Error("비공개 저장소 호스트가 일치하지 않습니다.");
    const copied = await get(blob.url, {
      access: "private",
      token: privateToken,
      storeId: privateStoreId,
      useCache: false,
    });
    if (!copied || copied.statusCode !== 200) throw new Error("비공개 사본을 읽을 수 없습니다.");
    const checkBytes = Buffer.from(await new Response(copied.stream).arrayBuffer());
    if (
      checkBytes.length !== bytes.length ||
      createHash("sha256").update(checkBytes).digest("hex") !==
        createHash("sha256").update(bytes).digest("hex")
    ) {
      throw new Error("비공개 사본의 바이트가 일치하지 않습니다.");
    }

    // 이전 전후 URL을 소유권 원장에 기록해 실패·삭제 재시도 대상을 보존합니다.
    const [owner] =
      await sql`SELECT uploaded_by_id FROM markdown_image_assets WHERE url = ${row.url} LIMIT 1`;
    await sql`INSERT INTO markdown_image_assets (url, uploaded_by_id)
      VALUES (${row.url}, ${owner?.uploaded_by_id ?? null}) ON CONFLICT (url) DO NOTHING`;
    await sql`INSERT INTO markdown_image_assets (url, uploaded_by_id)
      VALUES (${blob.url}, ${owner?.uploaded_by_id ?? null}) ON CONFLICT (url) DO NOTHING`;
    // UPDATE 응답이 실패해도 DB에서는 이미 커밋되었을 수 있으므로 시도부터 사본을 보존합니다.
    // CAS 경합도 자동 삭제하지 않고 원장과 함께 남겨 별도로 참조를 확인할 수 있게 합니다.
    swapAttempted = true;
    const updated = await updateReference(row, blob.url);
    if (updated.length !== 1) throw new Error("DB 참조가 동시에 변경되었습니다.");
  } finally {
    // DB 교체를 시도하기 전 검증·원장 기록 단계에서 실패한 사본만 회수합니다.
    if (!swapAttempted) {
      await del(blob.url, { token: privateToken });
      await sql`UPDATE markdown_image_assets SET deleted_at = now()
        WHERE url = ${blob.url} AND deleted_at IS NULL`;
    }
  }
}

const rows = await resourceRows();
const publicRows = rows.filter((row) => accessOf(row.url) === "public");
const privateRows = rows.filter((row) => accessOf(row.url) === "private");
const unknownRows = rows.length - publicRows.length - privateRows.length;
console.log(
  `보호 자료 참조: 공개 ${publicRows.length}개, 비공개 ${privateRows.length}개, 확인 필요 ${unknownRows}개`,
);
if (unknownRows > 0) throw new Error("알 수 없는 자료 URL이 있어 이전을 중단합니다.");

if (apply) {
  let completed = 0;
  for (const row of publicRows) {
    try {
      await copyAndSwap(row);
      completed += 1;
    } catch (error) {
      // SDK 오류에는 원본 URL이나 파일명이 담길 수 있어 이름만 출력합니다.
      console.error(
        `보호 자료 이전 실패 (${row.kind}, ${error instanceof Error ? error.name : "UnknownError"})`,
      );
      process.exitCode = 1;
      break;
    }
  }
  console.log(`바이트 검증·DB 조건부 이전 완료: ${completed}개`);
} else if (deletePublic) {
  if (publicRows.length > 0) throw new Error("공개 자료 참조가 남아 원본을 삭제할 수 없습니다.");
  // 기존 참조가 모두 살아 있는 비공개 사본을 가리키는지 먼저 확인합니다.
  for (const row of privateRows) {
    let stored;
    try {
      // SDK 오류에는 보호 URL이나 저장소 정보가 담길 수 있으므로 고정 오류로 바꿉니다.
      stored = await head(row.url, { token: privateToken });
    } catch {
      throw new Error("비공개 사본을 확인할 수 없어 공개 원본을 보존합니다.");
    }
    if (
      !stored ||
      stored.url !== row.url ||
      !Number.isSafeInteger(stored.size) ||
      stored.size < 1
    ) {
      throw new Error("비공개 사본을 확인할 수 없어 공개 원본을 보존합니다.");
    }
  }
  const candidates = await sql`
    SELECT a.id, a.url FROM markdown_image_assets a
    WHERE a.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM markdown_image_references r WHERE r.asset_id = a.id)
  `;
  let deleted = 0;
  for (const candidate of candidates) {
    if (
      accessOf(candidate.url) !== "public" ||
      !protectedPrefixes.some((prefix) =>
        new URL(candidate.url).pathname.slice(1).startsWith(prefix),
      )
    )
      continue;
    // 삭제 직전 참조 뷰를 다시 읽어 다른 콘텐츠에서 공유된 URL을 보존합니다.
    const current =
      await sql`SELECT 1 FROM markdown_image_references WHERE asset_id = ${candidate.id} LIMIT 1`;
    if (current.length > 0) continue;
    try {
      const original = await head(candidate.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
      await del(candidate.url, {
        token: process.env.BLOB_READ_WRITE_TOKEN,
        ifMatch: original.etag,
      });
      await sql`UPDATE markdown_image_assets SET deleted_at = now()
        WHERE id = ${candidate.id} AND deleted_at IS NULL`;
      deleted += 1;
    } catch (error) {
      console.error(
        `공개 원본 삭제 실패 (${error instanceof Error ? error.name : "UnknownError"})`,
      );
      process.exitCode = 1;
      break;
    }
  }
  console.log(`참조 없는 공개 원본 삭제: ${deleted}개`);
} else {
  console.log("읽기 전용 점검 완료. --apply로 이전한 뒤 검증하고 --delete-public을 실행합니다.");
}
