/** 모바일 HTTP 검증에만 쓰는 공개 자료 열과 실제 모바일 migration을 G1 fixture 위에 설치한다. */
import { readFileSync } from "node:fs";
import { installAcademicG1Base, installAcademicG1Migrations, seedAcademicG1Domain } from "./academic-g1-fixture.mjs";

export function installMobileFixture(cluster) {
  installAcademicG1Base(cluster);
  installAcademicG1Migrations(cluster);
  seedAcademicG1Domain(cluster);
  const migration = readFileSync(new URL("../../scripts/migrate-mobile-sessions.sql", import.meta.url), "utf8");
  cluster.sql(migration);
  cluster.sql(migration);
  // 기존 G1 최소 fixture에 공개 조회가 실제로 소비하는 열만 추가한다.
  cluster.sql(`ALTER TABLE guidebooks ADD COLUMN title varchar(300) NOT NULL DEFAULT '격리 가이드', ADD COLUMN created_at timestamp NOT NULL DEFAULT now();
    ALTER TABLE schedule_events ADD COLUMN end_time varchar(5), ADD COLUMN week_number integer,
      ADD COLUMN description text, ADD COLUMN is_public boolean NOT NULL DEFAULT true;
    ALTER TABLE schedule_sessions ADD COLUMN faculty_id uuid, ADD COLUMN report_category varchar(50), ADD COLUMN sub_description text;
    CREATE TABLE faculty(id uuid PRIMARY KEY,name varchar(100) NOT NULL);
    CREATE TABLE notices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title varchar(300) NOT NULL,content text NOT NULL,
      status text NOT NULL,pinned boolean NOT NULL DEFAULT false,author_id uuid,view_count integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
    INSERT INTO notices(title,content,status) VALUES('격리 공지','공개 본문','PUBLISHED');`);
}
