/** 공용 OpenAPI에서 자동 생성합니다. 직접 편집하지 마세요. */
export interface paths {
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 이메일·비밀번호로 모바일 로그인
         * @description 이메일·비밀번호만 사용하며 소셜 로그인은 지원하지 않습니다. query key는 허용하지 않습니다. application/json과 실제 16KiB 본문 상한을 적용합니다. 이메일은 앞뒤 공백 제거 후 검사합니다. 잘못된 자격 증명은 계정 존재 여부를 구별하지 않는 일반 401입니다. ADMIN·PENDING도 로그인할 수 있지만 기존 API의 역할별 인가는 유지합니다. PENDING은 본인 프로필만 조회하며 자료·학사 권한을 얻지 않습니다. 토큰 수명은 응답의 만료 시각을 따릅니다. 쿠키를 읽거나 설정하지 않으며 Origin 없이 사용할 수 있습니다. 제한 초과는 계정 조회·비밀번호 비교 전에 429로 거부하고 제한 저장소 장애는 503으로 구분합니다.
         */
        post: operations["loginMobile"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 모바일 세션 갱신 및 토큰 회전
         * @description application/json으로 refreshToken 하나만 받으며 query key는 허용하지 않습니다. 실제 JSON 본문은 16KiB 이하입니다. 쿠키를 읽거나 설정하지 않으며 Origin·access token 없이 사용합니다. 성공하면 두 토큰을 모두 교체합니다. 잘못됨·만료·철회·세션 버전 불일치·재사용은 모두 일반 401 UNAUTHENTICATED입니다. 정상 동시 회전 경합도 포함하며 직전 소비 토큰은 회전 후 10초 유예 안에서 401만 반환하고 세션을 폐기하지 않습니다. 그 직전 토큰을 유예 밖에서 제시하거나 더 오래전에 소비된 어느 세대의 토큰을 제시해도 토큰 계열 재사용으로 해당 세션 전체를 폐기합니다. 클라이언트는 시작·인터셉터·전경 복귀·백그라운드 작업이 하나의 single-flight 갱신 조정자를 공유하고 세션 세대로 오래된 실패를 구별합니다. 전송 결과가 불명확한 갱신은 자동 재시도하지 않으며 변경 요청도 자동 재전송하지 않습니다. IP·세션별 요청 제한은 성공한 갱신도 계산하며 429와 제한 저장소 장애 503을 구분합니다.
         */
        post: operations["refreshMobileSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 모바일 단일 세션 로그아웃
         * @description application/json으로 refreshToken 하나만 받으며 query key는 허용하지 않습니다. 실제 JSON 본문은 16KiB 이하입니다. 쿠키를 읽거나 설정하지 않으며 Origin·access token 없이 사용합니다. 해당 모바일 세션의 두 토큰을 폐기하며 알 수 없거나 이미 폐기된 토큰도 204인 멱등 연산입니다. 토큰 조회 전에 갱신과 같은 IP 예산(mobile-refresh-ip)을 소비하며 소진 시 429입니다.
         */
        post: operations["logoutMobile"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 본인의 모든 모바일 세션 로그아웃
         * @description 유효한 모바일 Bearer access token이 필수이며 쿠키만으로 호출할 수 없습니다. Authorization 헤더가 있지만 유효하지 않거나 지원하지 않는 인증 방식이면 401이며 쿠키로 대체하지 않습니다. 어떤 본문이나 query key도 허용하지 않고 400으로 거부합니다. 현재 계정의 모든 모바일 세션만 폐기하며 Auth.js Web 쿠키 세션은 변경하지 않습니다.
         */
        post: operations["logoutAllMobile"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 발행된 공지사항 목록 조회
         * @description 초안은 포함하지 않습니다. 알 수 없거나 중복된 query key는 400으로 거부합니다. 전체 범위를 넘는 페이지는 요청한 page 번호와 빈 notices 배열을 반환합니다. Web 화면의 마지막 페이지 보정 규칙과 구분합니다.
         */
        get: operations["listPublishedNotices"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/notices/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 발행된 공지사항 상세 조회
         * @description 발행 상태인 공지만 조회합니다. 초안이나 존재하지 않는 공지는 404를 반환합니다. query key는 허용하지 않습니다. 본문 응답은 조회수 증가 처리와 분리되며 방문자 중복 제거를 보장하지 않습니다.
         */
        get: operations["getPublishedNoticeDetail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 현재 로그인한 사용자의 프로필 조회
         * @description 모바일 Bearer access token 또는 Auth.js Web 세션 쿠키가 필요한 경로입니다. Authorization 헤더가 있으면 쿠키보다 우선하며 유효하지 않은 Authorization은 쿠키로 대체하지 않고 401입니다. 쿠키 이름은 환경·보안 접두어·분할 여부에 따라 달라져 고정하지 않습니다. PENDING 사용자도 자신의 프로필만 조회할 수 있으며 자료 접근 권한을 얻지 않습니다. query key는 허용하지 않습니다.
         */
        get: operations["getCurrentUser"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/schedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 공개 월별 일정 조회
         * @description year와 month를 모두 지정해야 합니다. 알 수 없거나 중복된 query key는 400으로 거부합니다. calendarDate와 startTime/endTime은 Asia/Seoul의 달력 날짜와 벽시계 시각이며 실제 UTC 순간이나 UTC wire timestamp가 아닙니다. 비공개 일정은 포함하지 않습니다.
         */
        get: operations["listPublicScheduleMonth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources/guidebooks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 승인 회원 가이드북 목록 조회
         * @description 모바일 Bearer access token 또는 Auth.js Web 세션 쿠키와 승인된 회원 권한이 필요합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 유효하지 않은 Authorization은 쿠키로 대체하지 않고 401입니다. 쿠키 이름은 환경·보안 접두어·분할 여부에 따라 달라 고정하지 않으며 PENDING은 403, 세션이 없거나 현재 계정이 유효하지 않으면 401입니다. 알 수 없거나 중복된 query key는 400으로 거부합니다. 페이지 범위를 넘으면 요청한 page와 빈 guidebooks 배열을 반환합니다. 비공개 파일 URL·파일명·토큰은 반환하지 않습니다.
         */
        get: operations["listMemberGuidebooks"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/assignments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 본인 과제 목록 조회
         * @description 모바일 Bearer access token 또는 Auth.js Web 세션 쿠키로 매 요청 현재 권한을 검증합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 유효하지 않은 Authorization은 쿠키로 대체하지 않고 401입니다. 사용자 ID·역할·저장 키를 권한 증명으로 입력받지 않습니다. 알 수 없거나 중복된 query key를 400으로 거부합니다. MEMBER 본인의 유효한 학적과 공개된 대상만 조회합니다. 범위를 넘으면 요청 번호를 유지한 빈 배열을 반환합니다. 총수를 조회하지 않아 page에는 page·pageSize·hasNextPage만 포함합니다.
         */
        get: operations["listMyAssignments"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/assignments/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 본인 과제 상세 조회
         * @description 모바일 Bearer access token 또는 Auth.js Web 세션 쿠키로 매 요청 현재 권한을 검증합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 유효하지 않은 Authorization은 쿠키로 대체하지 않고 401입니다. 사용자 ID·역할·저장 키를 권한 증명으로 입력받지 않습니다. query key는 허용하지 않습니다. MEMBER 본인에게 공개된 과제의 지침·최종 제출·PDF 메타만 반환합니다. 타인 대상·초안은 같은 404입니다.
         */
        get: operations["getMyAssignment"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/assignments/{id}/submission": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 과제의 본인 최종 제출 조회
         * @description 모바일 Bearer access token 또는 Auth.js Web 세션 쿠키로 매 요청 현재 권한을 검증합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 유효하지 않은 Authorization은 쿠키로 대체하지 않고 401입니다. 사용자 ID·역할·저장 키를 권한 증명으로 입력받지 않습니다. query key는 허용하지 않습니다. 본인 과제 상세와 동일한 인가를 적용하고 submission과 file만 재투영합니다. 아직 제출하지 않았으면 두 값은 null입니다.
         */
        get: operations["getMyAssignmentSubmission"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/submissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 본인 과제 제출 확정
         * @description 모바일 Bearer access token 또는 Auth.js Web 세션 쿠키로 매 요청 현재 권한을 검증합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 유효하지 않은 Authorization은 쿠키로 대체하지 않고 401입니다. 사용자 ID·역할·저장 키를 권한 증명으로 입력받지 않습니다. query key는 허용하지 않습니다. 쿠키 요청은 동일 출처 Origin이 필수이고 검증된 Bearer 요청은 Origin 검사를 생략하며, application/json이 필수이고 실제 JSON 본문을 16KiB로 제한합니다. 동일한 submissionKey는 이미 확정된 성공을 복구하며 새 확정과 재시도 모두 HTTP 200입니다. replayed로 구분합니다. 실제 파일 검증·마감·현재 대상 재인가·원자 저장은 기존 Application Service에서 수행합니다.
         */
        post: operations["finalizeMyAssignmentSubmission"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/uploads/intents": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 본인 과제 PDF 업로드 의도 발급
         * @description 모바일 Bearer access token 또는 Auth.js Web 세션 쿠키로 매 요청 현재 권한을 검증합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 유효하지 않은 Authorization은 쿠키로 대체하지 않고 401입니다. 사용자 ID·역할·저장 키를 권한 증명으로 입력받지 않습니다. query key는 허용하지 않습니다. 쿠키 요청은 동일 출처 Origin이 필수이고 검증된 Bearer 요청은 Origin 검사를 생략하며, application/json이 필수이고 실제 JSON 본문을 16KiB로 제한합니다. PDF 한 개를 50MiB 이하로 요청합니다. 원본 파일 URL·토큰 대신 발급 ID·불투명 pathname·UTC 만료 시각만 반환합니다. 파일명은 저장 키로 사용하지 않습니다.
         */
        post: operations["createMyAssignmentUploadIntent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/uploads/intents/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * 본인 업로드 의도 취소
         * @description 모바일 Bearer access token 또는 Auth.js Web 세션 쿠키로 매 요청 현재 권한을 검증합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 유효하지 않은 Authorization은 쿠키로 대체하지 않고 401입니다. 사용자 ID·역할·저장 키를 권한 증명으로 입력받지 않습니다. query key는 허용하지 않습니다. 쿠키 요청은 동일 출처 Origin이 필수이고 검증된 Bearer 요청은 Origin 검사를 생략하며, application/json이 필수이고 실제 JSON 본문을 16KiB로 제한합니다. 현재 본인 대상·발급 소유권을 다시 확인하고 원장을 종료합니다. CANCELLED는 실제 객체의 즉시 삭제를 뜻하지 않습니다.
         */
        delete: operations["cancelMyAssignmentUploadIntent"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/uploads/{id}/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 본인 업로드 PDF 검증
         * @description 모바일 Bearer access token 또는 Auth.js Web 세션 쿠키로 매 요청 현재 권한을 검증합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 유효하지 않은 Authorization은 쿠키로 대체하지 않고 401입니다. 사용자 ID·역할·저장 키를 권한 증명으로 입력받지 않습니다. query key는 허용하지 않습니다. 쿠키 요청은 동일 출처 Origin이 필수이고 검증된 Bearer 요청은 Origin 검사를 생략하며, application/json이 필수이고 실제 JSON 본문을 16KiB로 제한합니다. 서버가 비공개 원본의 크기·PDF 시그니처·SHA256을 검증하고 원장에 기록합니다. VERIFIED는 최종 제출 완료가 아닙니다.
         */
        post: operations["verifyMyAssignmentUploadIntent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/uploads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * 과제 업로드 SDK 토큰·서명 영수증 교환
         * @description 모바일 Bearer access token 또는 Auth.js Web 세션 쿠키로 매 요청 현재 권한을 검증합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 유효하지 않은 Authorization은 쿠키로 대체하지 않고 401입니다. 사용자 ID·역할·저장 키를 권한 증명으로 입력받지 않습니다. query key는 허용하지 않습니다. application/json의 실제 본문을 16KiB로 제한합니다. blob.generate-client-token은 쿠키 요청의 동일 출처 Origin(검증된 Bearer 요청은 생략)·현재 MEMBER 대상·발급 소유권·정확한 pathname·단일 PUT과 요청 예산을 검증합니다. 토큰 생성의 Origin 거부는 기존 서비스의 404 NOT_FOUND를 유지합니다. blob.upload-completed만 공급자 SDK 서명을 검증한 callback으로 Origin·사용자 세션 없이 수신합니다. 추가 JSON 속성과 키 순서를 포함한 원본 파싱 객체를 SDK에 전달하며 재구성한 객체로 서명을 검증하지 않습니다. callback은 기존 원장 수신을 멱등 기록하고 VERIFIED나 제출 완료로 승격하지 않습니다. 성공 본문은 Vercel SDK 프로토콜 그대로이며 오류만 공통 v1 JSON입니다.
         */
        post: operations["exchangeAssignmentUploadProtocol"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/submissions/{id}/files/{fileId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 인가된 개인 제출 PDF 다운로드
         * @description 모바일 Bearer access token 또는 Auth.js Web 세션 쿠키로 매 요청 현재 권한을 검증합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 유효하지 않은 Authorization은 쿠키로 대체하지 않고 401입니다. 사용자 ID·역할·저장 키를 권한 증명으로 입력받지 않습니다. query key는 허용하지 않습니다. 현재 본인 소유권 또는 지정 학사 책임자 인가와 감사 기록이 확인된 뒤에만 비공개 Blob을 읽습니다. 홈페이지 ADMIN·교수 FACULTY 역할만으로 허용하지 않습니다. 원본 URL·저장 키·토큰을 응답에 포함하지 않습니다. 파일은 첨부 스트림이며 응답 시작 뒤 전송 중단은 JSON 오류로 바꿀 수 없어 스트림을 중단하고 고정 감사 이벤트로 기록합니다.
         */
        get: operations["downloadAuthorizedSubmissionFile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources/guidebooks/{id}/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 승인 회원 가이드북 파일 다운로드
         * @description 모바일 Bearer access token 또는 현재 Auth.js Web 세션 쿠키와 승인된 회원 권한이 필요합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 비어 있거나 잘못된 토큰·형식·지원하지 않는 인증 방식·만료·회수된 모바일 세션은 유효한 쿠키가 함께 있어도 401입니다. 모바일 세션은 매 요청 현재 상태를 다시 확인하며 세션 저장소 장애는 503입니다. 쿠키 이름은 환경·보안 접두어·분할 여부에 따라 달라 고정하지 않습니다. 인증 주체가 없거나 삭제·역할 변경으로 현재 계정이 유효하지 않으면 401, PENDING은 403입니다. query key는 허용하지 않습니다(inline 미리보기 미지원). 승인 회원(ADMIN·FACULTY·MEMBER)은 모든 가이드북 원본을 받습니다. 서버가 프로젝트 공개 저장소 또는 지정 비공개 Blob 저장소의 원본만 읽어 첨부 스트림으로 전달하며 원본 URL·저장 키·토큰을 응답하거나 리다이렉트하지 않습니다. Content-Type은 저장된 원본 MIME이고 알 수 없으면 application/octet-stream입니다. 응답 시작 뒤 전송 중단은 JSON 오류로 바꿀 수 없어 스트림을 고정 오류로 중단합니다.
         */
        get: operations["downloadMemberGuidebookFile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources/class-materials": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 승인 회원 강의자료 목록 조회
         * @description 모바일 Bearer access token 또는 현재 Auth.js Web 세션 쿠키와 승인된 회원 권한이 필요합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 비어 있거나 잘못된 토큰·형식·지원하지 않는 인증 방식·만료·회수된 모바일 세션은 유효한 쿠키가 함께 있어도 401입니다. 모바일 세션은 매 요청 현재 상태를 다시 확인하며 세션 저장소 장애는 503입니다. 쿠키 이름은 환경·보안 접두어·분할 여부에 따라 달라 고정하지 않습니다. 인증 주체가 없거나 삭제·역할 변경으로 현재 계정이 유효하지 않으면 401, PENDING은 403입니다. 알 수 없거나 중복된 query key는 400으로 거부합니다. 페이지 범위를 넘으면 요청한 page와 빈 배열을 반환합니다. MEMBER는 학생용(STUDENT) 강의자료만, ADMIN·FACULTY는 학생용·교수용(FACULTY)을 조회 단계에서 받습니다. 수업일 역순(없으면 마지막)·작성 시각·ID 역순으로 정렬합니다. 원본 파일 URL·파일명·업로더 정보·시간대 없는 작성 시각은 반환하지 않습니다.
         */
        get: operations["listMemberClassMaterials"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources/class-materials/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 승인 회원 강의자료 상세 조회
         * @description 모바일 Bearer access token 또는 현재 Auth.js Web 세션 쿠키와 승인된 회원 권한이 필요합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 비어 있거나 잘못된 토큰·형식·지원하지 않는 인증 방식·만료·회수된 모바일 세션은 유효한 쿠키가 함께 있어도 401입니다. 모바일 세션은 매 요청 현재 상태를 다시 확인하며 세션 저장소 장애는 503입니다. 쿠키 이름은 환경·보안 접두어·분할 여부에 따라 달라 고정하지 않습니다. 인증 주체가 없거나 삭제·역할 변경으로 현재 계정이 유효하지 않으면 401, PENDING은 403입니다. query key는 허용하지 않습니다. MEMBER는 학생용(STUDENT) 강의자료만, ADMIN·FACULTY는 학생용·교수용(FACULTY)을 조회 단계에서 받습니다. 원본 파일 URL은 반환하지 않고 다운로드 표시용 파일명만 포함합니다.
         */
        get: operations["getMemberClassMaterial"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources/class-materials/{id}/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 승인 회원 강의자료 파일 다운로드
         * @description 모바일 Bearer access token 또는 현재 Auth.js Web 세션 쿠키와 승인된 회원 권한이 필요합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 비어 있거나 잘못된 토큰·형식·지원하지 않는 인증 방식·만료·회수된 모바일 세션은 유효한 쿠키가 함께 있어도 401입니다. 모바일 세션은 매 요청 현재 상태를 다시 확인하며 세션 저장소 장애는 503입니다. 쿠키 이름은 환경·보안 접두어·분할 여부에 따라 달라 고정하지 않습니다. 인증 주체가 없거나 삭제·역할 변경으로 현재 계정이 유효하지 않으면 401, PENDING은 403입니다. query key는 허용하지 않습니다(inline 미리보기 미지원). MEMBER는 학생용(STUDENT) 강의자료만, ADMIN·FACULTY는 학생용·교수용(FACULTY)을 조회 단계에서 받습니다. 서버가 프로젝트 공개 저장소 또는 지정 비공개 Blob 저장소의 원본만 읽어 첨부 스트림으로 전달하며 원본 URL·저장 키·토큰을 응답하거나 리다이렉트하지 않습니다. Content-Type은 저장된 원본 MIME이고 알 수 없으면 application/octet-stream입니다. 응답 시작 뒤 전송 중단은 JSON 오류로 바꿀 수 없어 스트림을 고정 오류로 중단합니다.
         */
        get: operations["downloadMemberClassMaterialFile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources/weekly-texts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 승인 회원 주차별 텍스트 목록 조회
         * @description 모바일 Bearer access token 또는 현재 Auth.js Web 세션 쿠키와 승인된 회원 권한이 필요합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 비어 있거나 잘못된 토큰·형식·지원하지 않는 인증 방식·만료·회수된 모바일 세션은 유효한 쿠키가 함께 있어도 401입니다. 모바일 세션은 매 요청 현재 상태를 다시 확인하며 세션 저장소 장애는 503입니다. 쿠키 이름은 환경·보안 접두어·분할 여부에 따라 달라 고정하지 않습니다. 인증 주체가 없거나 삭제·역할 변경으로 현재 계정이 유효하지 않으면 401, PENDING은 403입니다. 알 수 없거나 중복된 query key는 400으로 거부합니다. 페이지 범위를 넘으면 요청한 page와 빈 배열을 반환합니다. 주차별 텍스트는 공동 자료 정책(#100)에 따라 승인 회원이 기수와 무관하게 열람합니다. 수업일 역순(없으면 마지막)·작성 시각·ID 역순으로 정렬합니다. 본문·원본 파일 URL·파일명은 반환하지 않고 hasBody·hasFile 존재 여부만 제공합니다.
         */
        get: operations["listMemberWeeklyTexts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources/weekly-texts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 승인 회원 주차별 텍스트 상세 조회
         * @description 모바일 Bearer access token 또는 현재 Auth.js Web 세션 쿠키와 승인된 회원 권한이 필요합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 비어 있거나 잘못된 토큰·형식·지원하지 않는 인증 방식·만료·회수된 모바일 세션은 유효한 쿠키가 함께 있어도 401입니다. 모바일 세션은 매 요청 현재 상태를 다시 확인하며 세션 저장소 장애는 503입니다. 쿠키 이름은 환경·보안 접두어·분할 여부에 따라 달라 고정하지 않습니다. 인증 주체가 없거나 삭제·역할 변경으로 현재 계정이 유효하지 않으면 401, PENDING은 403입니다. query key는 허용하지 않습니다. 주차별 텍스트는 공동 자료 정책(#100)에 따라 승인 회원이 기수와 무관하게 열람합니다. Markdown 본문과 첨부 표시용 파일명만 추가하며 원본 파일 URL과 첨부 사진은 반환하지 않습니다.
         */
        get: operations["getMemberWeeklyText"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/resources/weekly-texts/{id}/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * 승인 회원 주차별 텍스트 첨부 다운로드
         * @description 모바일 Bearer access token 또는 현재 Auth.js Web 세션 쿠키와 승인된 회원 권한이 필요합니다. Authorization 헤더가 있으면 쿠키보다 우선하며 비어 있거나 잘못된 토큰·형식·지원하지 않는 인증 방식·만료·회수된 모바일 세션은 유효한 쿠키가 함께 있어도 401입니다. 모바일 세션은 매 요청 현재 상태를 다시 확인하며 세션 저장소 장애는 503입니다. 쿠키 이름은 환경·보안 접두어·분할 여부에 따라 달라 고정하지 않습니다. 인증 주체가 없거나 삭제·역할 변경으로 현재 계정이 유효하지 않으면 401, PENDING은 403입니다. query key는 허용하지 않습니다(inline 미리보기 미지원). 주차별 텍스트는 공동 자료 정책(#100)에 따라 승인 회원이 기수와 무관하게 열람합니다. 본문만 있고 첨부가 없는 텍스트는 404입니다. 서버가 프로젝트 공개 저장소 또는 지정 비공개 Blob 저장소의 원본만 읽어 첨부 스트림으로 전달하며 원본 URL·저장 키·토큰을 응답하거나 리다이렉트하지 않습니다. Content-Type은 저장된 원본 MIME이고 알 수 없으면 application/octet-stream입니다. 응답 시작 뒤 전송 중단은 JSON 오류로 바꿀 수 없어 스트림을 고정 오류로 중단합니다.
         */
        get: operations["downloadMemberWeeklyTextFile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        MeUser: {
            /** Format: uuid */
            id: string;
            name: string | null;
            email: string | null;
            /** @enum {string} */
            role: "ADMIN" | "FACULTY" | "MEMBER" | "PENDING";
            /** Format: uuid */
            cohortId: string | null;
            imageUrl: string | null;
        };
        MeResponse: {
            user: components["schemas"]["MeUser"];
        };
        NoticeSummary: {
            /** Format: uuid */
            id: string;
            title: string;
            excerpt: string;
            pinned: boolean;
            viewCount: number;
            createdAt: components["schemas"]["UtcTimestamp"];
            updatedAt: components["schemas"]["UtcTimestamp"];
        };
        /**
         * Format: date-time
         * @description UTC 밀리초 정밀도 ISO-8601 wire timestamp입니다.
         */
        UtcTimestamp: string;
        PageMeta: {
            page: number;
            pageSize: number;
            totalCount: number;
            totalPages: number;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
        };
        NoticeListResponse: {
            notices: components["schemas"]["NoticeSummary"][];
            page: components["schemas"]["PageMeta"];
        };
        InvalidInputError: {
            error: {
                /** @constant */
                code: "INVALID_INPUT";
                message: string;
                /** Format: uuid */
                requestId: string;
            };
        };
        UnauthenticatedError: {
            error: {
                /** @constant */
                code: "UNAUTHENTICATED";
                message: string;
                /** Format: uuid */
                requestId: string;
            };
        };
        UnavailableError: {
            error: {
                /** @constant */
                code: "UNAVAILABLE";
                message: string;
                /** Format: uuid */
                requestId: string;
            };
        };
        /** @description Asia/Seoul 달력의 HH:MM 벽시계 시각이며 UTC timestamp가 아닙니다. */
        ScheduleWallTime: string;
        /**
         * Format: date
         * @description Asia/Seoul의 YYYY-MM-DD 달력 날짜이며 UTC timestamp가 아닙니다.
         */
        ScheduleCalendarDate: string;
        ScheduleNamedReference: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        ScheduleSession: {
            /** @enum {string} */
            category: "CLASSICS" | "ENGLISH" | "SPEECH" | "SPECIAL_LECTURE" | "CASE_STUDY";
            content: string | null;
            reportCategory: string | null;
            subTitle: string | null;
            subDescription: string | null;
            faculty: components["schemas"]["ScheduleNamedReference"] | null;
            order: number;
        };
        ScheduleEvent: {
            /** Format: uuid */
            id: string;
            calendarDate: components["schemas"]["ScheduleCalendarDate"];
            startTime: components["schemas"]["ScheduleWallTime"];
            /** @description 종료 벽시계만 표시하며 종료 날짜·자정 넘김·지속 시간을 보증하지 않습니다. */
            endTime: components["schemas"]["ScheduleWallTime"] | null;
            /** @enum {string} */
            eventType: "CLASS" | "EVENT";
            title: string;
            weekNumber: number | null;
            description: string | null;
            cohort: components["schemas"]["ScheduleNamedReference"] | null;
            sessions: components["schemas"]["ScheduleSession"][];
        };
        ScheduleResponse: {
            year: number;
            month: number;
            /** @constant */
            timeZone: "Asia/Seoul";
            events: components["schemas"]["ScheduleEvent"][];
        };
        NoticeDetail: {
            /** Format: uuid */
            id: string;
            title: string;
            /** @description 발행된 공지사항의 Markdown 본문입니다. */
            content: string;
            viewCount: number;
            createdAt: components["schemas"]["UtcTimestamp"];
        };
        NoticeDetailResponse: {
            notice: components["schemas"]["NoticeDetail"];
        };
        NotFoundError: {
            error: {
                /** @constant */
                code: "NOT_FOUND";
                message: string;
                /** Format: uuid */
                requestId: string;
            };
        };
        GuidebookSummary: {
            /** Format: uuid */
            id: string;
            title: string;
        };
        GuidebookListResponse: {
            guidebooks: components["schemas"]["GuidebookSummary"][];
            page: components["schemas"]["PageMeta"];
        };
        ForbiddenError: {
            error: {
                /** @constant */
                code: "FORBIDDEN";
                message: string;
                /** Format: uuid */
                requestId: string;
            };
        };
        AcademicSubmissionSummary: {
            /** Format: uuid */
            submissionId: string;
            submittedAt: components["schemas"]["UtcTimestamp"];
        };
        AcademicFileMetadata: {
            /** Format: uuid */
            fileId: string;
            originalName: string;
            /** @constant */
            mimeType: "application/pdf";
            sizeBytes: number;
        };
        AcademicAssignmentSummary: {
            /** Format: uuid */
            assignmentId: string;
            /** Format: uuid */
            targetId: string;
            title: string;
            /** @enum {string} */
            status: "PUBLISHED" | "CLOSED";
            dueAt: components["schemas"]["UtcTimestamp"];
            publishedAt: components["schemas"]["UtcTimestamp"];
            submission: components["schemas"]["AcademicSubmissionSummary"] | null;
        };
        AcademicAssignmentDetail: {
            /** Format: uuid */
            assignmentId: string;
            /** Format: uuid */
            targetId: string;
            title: string;
            /** @enum {string} */
            status: "PUBLISHED" | "CLOSED";
            dueAt: components["schemas"]["UtcTimestamp"];
            publishedAt: components["schemas"]["UtcTimestamp"];
            submission: components["schemas"]["AcademicSubmissionSummary"] | null;
            instructions: string;
            file: components["schemas"]["AcademicFileMetadata"] | null;
        };
        AcademicAssignmentPage: {
            page: number;
            pageSize: number;
            hasNextPage: boolean;
        };
        AcademicAssignmentListResponse: {
            assignments: components["schemas"]["AcademicAssignmentSummary"][];
            page: components["schemas"]["AcademicAssignmentPage"];
        };
        AcademicAssignmentDetailResponse: {
            assignment: components["schemas"]["AcademicAssignmentDetail"];
        };
        AcademicAssignmentSubmissionResponse: {
            submission: components["schemas"]["AcademicSubmissionSummary"] | null;
            file: components["schemas"]["AcademicFileMetadata"] | null;
        };
        AcademicFinalizeSubmissionInput: {
            /** Format: uuid */
            assignmentId: string;
            /** Format: uuid */
            uploadIntentId: string;
            /** Format: uuid */
            submissionKey: string;
        };
        AcademicFinalizedSubmissionResponse: {
            submission: {
                /** Format: uuid */
                assignmentId: string;
                /** Format: uuid */
                submissionId: string;
                submittedAt: components["schemas"]["UtcTimestamp"];
                replayed: boolean;
                file: components["schemas"]["AcademicFileMetadata"];
            };
        };
        AcademicUploadIntentInput: {
            /** Format: uuid */
            assignmentId: string;
            /** Format: uuid */
            requestId: string;
            /** @description 앞뒤 공백을 제거한 뒤 파일명 제약을 적용합니다. */
            originalName: string;
            sizeBytes: number;
            /** @constant */
            mimeType: "application/pdf";
        };
        AcademicUploadSelectionInput: {
            /** Format: uuid */
            assignmentId: string;
        };
        AcademicUploadIntentResponse: {
            /** Format: uuid */
            uploadIntentId: string;
            /** @description uploadIntentId를 소문자로 표현한 값과 경로의 UUID가 같아야 합니다. 공개 URL이 아니며 이 경로 자체로 다운로드할 수 없습니다. */
            pathname: string;
            expiresAt: components["schemas"]["UtcTimestamp"];
        };
        AcademicUploadVerifiedResponse: {
            /** @constant */
            state: "VERIFIED";
        };
        AcademicUploadCancelledResponse: {
            /** @constant */
            state: "CANCELLED";
        };
        AcademicDisabledError: {
            error: {
                /** @constant */
                code: "DISABLED";
                message: string;
                /** Format: uuid */
                requestId: string;
            };
        };
        AcademicConflictError: {
            error: {
                /** @constant */
                code: "CONFLICT";
                message: string;
                /** Format: uuid */
                requestId: string;
            };
        };
        AcademicTooLargeError: {
            error: {
                /** @constant */
                code: "TOO_LARGE";
                message: string;
                /** Format: uuid */
                requestId: string;
            };
        };
        AcademicStorageUnavailableError: {
            error: {
                /** @constant */
                code: "STORAGE_UNAVAILABLE";
                message: string;
                /** Format: uuid */
                requestId: string;
            };
        };
        AcademicRateLimitedError: {
            error: {
                /** @constant */
                code: "RATE_LIMITED";
                message: string;
                /** Format: uuid */
                requestId: string;
                retryAfterSeconds?: number;
            };
        };
        AcademicUnavailableError: components["schemas"]["AcademicDisabledError"] | components["schemas"]["AcademicStorageUnavailableError"] | components["schemas"]["UnavailableError"];
        AcademicUploadProtocolInput: ({
            /** @constant */
            type: "blob.generate-client-token";
            payload: {
                pathname: string;
                /** @constant */
                multipart: false;
                /** @description assignmentId와 uploadIntentId만 가진 JSON 문자열입니다. 현재 계정 소유권과 발급 원장을 서버에서 재검증합니다. */
                clientPayload: string | null;
            } & {
                [key: string]: unknown;
            };
        } & {
            [key: string]: unknown;
        }) | ({
            /** @constant */
            type: "blob.upload-completed";
            payload: {
                blob: {
                    url: string;
                    pathname: string;
                    downloadUrl: string;
                    contentType: string;
                    contentDisposition: string;
                    etag: string;
                } & {
                    [key: string]: unknown;
                };
                tokenPayload?: string | null;
            } & {
                [key: string]: unknown;
            };
        } & {
            [key: string]: unknown;
        });
        MobileDevice: {
            /** @enum {string} */
            platform: "ANDROID" | "IOS";
            appVersion?: string;
            deviceName?: string;
        };
        MobileLoginInput: {
            /**
             * Format: email
             * @description 앞뒤 공백을 제거한 뒤 길이와 이메일 형식을 검사합니다.
             */
            email: string;
            /** @description 공백 제거 등 변형 없이 검사합니다. */
            password: string;
            device?: components["schemas"]["MobileDevice"];
        };
        MobileRefreshInput: {
            refreshToken: string;
        };
        MobileLogoutInput: {
            refreshToken: string;
        };
        MobileSession: {
            /** @constant */
            tokenType: "Bearer";
            accessToken: string;
            accessTokenExpiresAt: components["schemas"]["UtcTimestamp"];
            refreshToken: string;
            refreshTokenExpiresAt: components["schemas"]["UtcTimestamp"];
        };
        MobileLoginResponse: {
            session: components["schemas"]["MobileSession"];
            user: components["schemas"]["MeUser"];
        };
        MobileRefreshResponse: {
            session: components["schemas"]["MobileSession"];
        };
        MobileRateLimitedError: {
            error: {
                /** @constant */
                code: "RATE_LIMITED";
                message: string;
                /** Format: uuid */
                requestId: string;
                retryAfterSeconds: number;
            };
        };
        AcademicUploadProtocolResponse: {
            /** @constant */
            type: "blob.generate-client-token";
            clientToken: string;
        } | {
            /** @constant */
            type: "blob.upload-completed";
            /** @constant */
            response: "ok";
        };
        /**
         * Format: date
         * @description Asia/Seoul의 YYYY-MM-DD 수업일이며 UTC timestamp가 아닙니다.
         */
        ResourceCalendarDate: string;
        ClassMaterialSummary: {
            /** Format: uuid */
            id: string;
            title: string;
            /** @enum {string} */
            audience: "STUDENT" | "FACULTY";
            weekNumber: number | null;
            lectureTitle: string | null;
            classDate: components["schemas"]["ResourceCalendarDate"] | null;
        };
        ClassMaterialDetail: {
            /** Format: uuid */
            id: string;
            title: string;
            /** @enum {string} */
            audience: "STUDENT" | "FACULTY";
            weekNumber: number | null;
            lectureTitle: string | null;
            classDate: components["schemas"]["ResourceCalendarDate"] | null;
            fileName: string;
        };
        ClassMaterialListResponse: {
            classMaterials: components["schemas"]["ClassMaterialSummary"][];
            page: components["schemas"]["PageMeta"];
        };
        ClassMaterialDetailResponse: {
            classMaterial: components["schemas"]["ClassMaterialDetail"];
        };
        WeeklyTextCohort: {
            /** Format: uuid */
            id: string;
            name: string;
        };
        WeeklyTextSummary: {
            /** Format: uuid */
            id: string;
            title: string;
            textType: string | null;
            cohort: components["schemas"]["WeeklyTextCohort"] | null;
            classDate: components["schemas"]["ResourceCalendarDate"] | null;
            hasBody: boolean;
            hasFile: boolean;
        };
        WeeklyTextDetail: {
            /** Format: uuid */
            id: string;
            title: string;
            textType: string | null;
            cohort: components["schemas"]["WeeklyTextCohort"] | null;
            classDate: components["schemas"]["ResourceCalendarDate"] | null;
            hasBody: boolean;
            hasFile: boolean;
            /** @description Markdown 원문입니다. 본문이 없으면 null입니다. */
            body: string | null;
            fileName: string | null;
        };
        WeeklyTextListResponse: {
            weeklyTexts: components["schemas"]["WeeklyTextSummary"][];
            page: components["schemas"]["PageMeta"];
        };
        WeeklyTextDetailResponse: {
            weeklyText: components["schemas"]["WeeklyTextDetail"];
        };
        /** @description 자료실 파일·메타데이터 조회의 사용자별 빈도 제한(#444) 초과 응답입니다. retryAfterSeconds는 Retry-After 헤더와 같은 1~3600초입니다. */
        ResourceRateLimitedError: {
            error: {
                /** @constant */
                code: "RATE_LIMITED";
                message: string;
                /** Format: uuid */
                requestId: string;
                retryAfterSeconds: number;
            };
        };
    };
    responses: {
        /** @description 자료실 조회 빈도 제한 초과(#444). /api/v1/resources 아래 모든 GET(목록·상세·파일)이 401·403 판단 뒤 반환할 수 있습니다. 인증 사용자별로 Web 쿠키·모바일 Bearer와 Web 다운로드 경로가 분당 300회·시간당 2000회 예산을 공유합니다. 기존 path item은 append-only 정책으로 바꾸지 않았으므로 이 응답 정의를 함께 참조합니다(#439). 제한 저장소 장애는 429가 아니라 503 UNAVAILABLE입니다. */
        ResourceRateLimited: {
            headers: {
                "Cache-Control"?: "private, no-store";
                Vary?: "Cookie, Authorization";
                "X-Request-Id"?: string;
                /** @description 본문 retryAfterSeconds와 같은 대기 초 수입니다. */
                "Retry-After"?: string;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ResourceRateLimitedError"];
            };
        };
        /** @description 자료 파일 경로(/api/v1/resources/*\/{id}/file)의 조회 빈도 제한 초과(#444). ResourceRateLimited와 같은 예산·본문이며 파일 경로 공통 sandbox 헤더를 함께 보냅니다. */
        ResourceFileRateLimited: {
            headers: {
                "Cache-Control"?: "private, no-store";
                Vary?: "Cookie, Authorization";
                "X-Request-Id"?: string;
                /** @description 본문 retryAfterSeconds와 같은 대기 초 수입니다. */
                "Retry-After"?: string;
                "X-Content-Type-Options"?: "nosniff";
                "Content-Security-Policy"?: "sandbox; default-src 'none'";
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ResourceRateLimitedError"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    loginMobile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MobileLoginInput"];
            };
        };
        responses: {
            /** @description 새 모바일 세션과 본인 공개 프로필 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MobileLoginResponse"];
                };
            };
            /** @description JSON·입력·query 형식 오류 */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 이메일·비밀번호가 유효하지 않음. 계정 존재 여부는 구별하지 않습니다. */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 실제로 읽은 JSON 본문이 16KiB를 초과함 */
            413: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicTooLargeError"];
                };
            };
            /** @description 로그인 요청 제한. 최대 15분 뒤 재시도합니다. */
            429: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    /** @description 본문 retryAfterSeconds와 같은 대기 초 수입니다. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MobileRateLimitedError"];
                };
            };
            /** @description 인증 저장소 등 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    refreshMobileSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MobileRefreshInput"];
            };
        };
        responses: {
            /** @description 회전된 모바일 세션 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MobileRefreshResponse"];
                };
            };
            /** @description JSON·입력·query 형식 오류 */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 잘못됨·만료·철회·버전 불일치·재사용 또는 정상 동시 회전 경합. 직전 토큰은 10초 유예 안에서 세션 폐기 없이 401이며 다른 소비 토큰 재사용은 세션 전체를 폐기합니다. */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 실제로 읽은 JSON 본문이 16KiB를 초과함 */
            413: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicTooLargeError"];
                };
            };
            /** @description 갱신 요청 제한 */
            429: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    /** @description 본문 retryAfterSeconds와 같은 대기 초 수입니다. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MobileRateLimitedError"];
                };
            };
            /** @description 인증 저장소 등 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    logoutMobile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MobileLogoutInput"];
            };
        };
        responses: {
            /** @description 세션 폐기 완료 또는 이미 사용할 수 없는 토큰. 본문은 없습니다. */
            204: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description JSON·입력·query 형식 오류 */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 실제로 읽은 JSON 본문이 16KiB를 초과함 */
            413: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicTooLargeError"];
                };
            };
            /** @description 갱신과 공유하는 IP 단위 요청 제한 */
            429: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    /** @description 본문 retryAfterSeconds와 같은 대기 초 수입니다. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MobileRateLimitedError"];
                };
            };
            /** @description 인증 저장소 등 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    logoutAllMobile: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 모든 모바일 세션 폐기 완료. 본문은 없습니다. */
            204: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description 허용되지 않은 본문 또는 query key가 있음. 빈 JSON 객체도 본문이므로 거부합니다. */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 유효한 모바일 Bearer access token이 없음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 인증 확인 또는 모바일 세션 폐기 저장소 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    listPublishedNotices: {
        parameters: {
            query?: {
                /** @description 1부터 시작하는 요청 페이지 번호입니다. pageSize와 계산한 OFFSET이 안전한 정수 범위를 넘으면 400으로 거부합니다. */
                page?: number;
                /** @description 한 번에 조회할 공지 수입니다. */
                pageSize?: number;
                /** @description 앞뒤 공백을 제거한 뒤 제목에서 대소문자를 구분하지 않고 검색합니다. */
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 발행 공지의 최소 DTO 목록과 요청 페이지 정보 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoticeListResponse"];
                };
            };
            /** @description query 입력이 잘못되었거나 중복·미등록 key가 있음 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 저장소 오류 등으로 현재 공지 목록을 제공할 수 없음 */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    getPublishedNoticeDetail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description 조회할 공지사항의 UUID입니다. 형식이 잘못되면 400을 반환합니다. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 발행된 공지사항의 공개 상세 DTO */
            200: {
                headers: {
                    /** @description 조회수 처리와 공개 상태 변경을 고려하여 응답을 저장하지 않습니다. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NoticeDetailResponse"];
                };
            };
            /** @description 공지 UUID 형식이 잘못되었거나 허용되지 않은 query key가 있음 */
            400: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 공지사항이 없거나 발행되지 않음 */
            404: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 저장소 장애로 공지 상세를 조회할 수 없음 */
            503: {
                headers: {
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    getCurrentUser: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 현재 로그인한 사용자 본인의 공개 가능 프로필 */
            200: {
                headers: {
                    /** @description 개인 프로필 응답을 공유 캐시와 로컬 캐시에 저장하지 않습니다. */
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeResponse"];
                };
            };
            /** @description 허용되지 않은 query key가 있음 */
            400: {
                headers: {
                    /** @description 개인 프로필 오류도 캐시하지 않습니다. */
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 세션이 없거나 계정 삭제·역할 변경으로 현재 로그인 상태가 유효하지 않음 */
            401: {
                headers: {
                    /** @description 인증 오류를 캐시하지 않습니다. */
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description Auth.js가 명시적으로 전파한 오류 또는 세션 확인 뒤 별도 프로필 저장소 조회 장애가 발생함 */
            503: {
                headers: {
                    /** @description 저장소 오류를 캐시하지 않습니다. */
                    "Cache-Control"?: "private, no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    listPublicScheduleMonth: {
        parameters: {
            query: {
                /** @description 조회할 한국 달력의 연도입니다. */
                year: number;
                /** @description 조회할 한국 달력의 월입니다. */
                month: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 지정한 월의 공개 일정과 한국 달력 벽시계 표시 값 */
            200: {
                headers: {
                    /** @description 월별 일정 응답을 저장하지 않습니다. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScheduleResponse"];
                };
            };
            /** @description 필수 year/month 누락·범위 오류·중복 또는 미등록 query key */
            400: {
                headers: {
                    /** @description 입력 오류 응답을 저장하지 않습니다. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 저장소 장애로 공개 월별 일정을 제공할 수 없음 */
            503: {
                headers: {
                    /** @description 저장소 오류 응답을 저장하지 않습니다. */
                    "Cache-Control"?: "no-store";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    listMemberGuidebooks: {
        parameters: {
            query?: {
                /** @description 1부터 시작하는 요청 페이지 번호입니다. pageSize와 계산한 OFFSET이 안전한 정수 범위를 넘으면 400으로 거부합니다. */
                page?: number;
                /** @description 한 번에 조회할 가이드북 수입니다. */
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 승인 회원에게 허용된 가이드북 제목 목록과 페이지 정보 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GuidebookListResponse"];
                };
            };
            /** @description page/pageSize 입력 오류 또는 중복·미등록 query key */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description Web 세션이 없거나 삭제·역할 변경으로 계정이 유효하지 않음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 승인 대기 PENDING 사용자에게 가이드북 조회 권한이 없음 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 명시적인 인증 오류 또는 저장소 장애로 목록을 제공할 수 없음 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    listMyAssignments: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 본인 과제 최소 DTO와 다음 페이지 여부 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicAssignmentListResponse"];
                };
            };
            /** @description 허용되지 않은 입력 또는 JSON 형식 오류 */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 유효한 Web 세션이 없음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 역할 또는 동일 출처 검증 거부 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 기능 비활성·스토리지 처리 실패 또는 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUnavailableError"];
                };
            };
        };
    };
    getMyAssignment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description 존재하지 않거나 허용되지 않은 대상과 잘못된 UUID는 동일한 404로 처리합니다. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 과제 지침과 본인 최종 제출 메타 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicAssignmentDetailResponse"];
                };
            };
            /** @description 허용되지 않은 입력 또는 JSON 형식 오류 */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 유효한 Web 세션이 없음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 역할 또는 동일 출처 검증 거부 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 대상·본인 대상이 아님·잘못된 경로 UUID */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 기능 비활성·스토리지 처리 실패 또는 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUnavailableError"];
                };
            };
        };
    };
    getMyAssignmentSubmission: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description 존재하지 않거나 허용되지 않은 대상과 잘못된 UUID는 동일한 404로 처리합니다. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 본인 최종 제출·파일 메타 또는 미제출 null */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicAssignmentSubmissionResponse"];
                };
            };
            /** @description 허용되지 않은 입력 또는 JSON 형식 오류 */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 유효한 Web 세션이 없음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 역할 또는 동일 출처 검증 거부 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 대상·본인 대상이 아님·잘못된 경로 UUID */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 기능 비활성·스토리지 처리 실패 또는 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUnavailableError"];
                };
            };
        };
    };
    finalizeMyAssignmentSubmission: {
        parameters: {
            query?: never;
            header?: {
                /** @description 쿠키 요청에서는 요청 URL과 동일한 신뢰 출처가 필요합니다. 검증된 모바일 Bearer 요청은 생략할 수 있습니다. */
                Origin?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcademicFinalizeSubmissionInput"];
            };
        };
        responses: {
            /** @description 새 제출 확정 또는 동일 키의 성공 복구 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicFinalizedSubmissionResponse"];
                };
            };
            /** @description 허용되지 않은 입력 또는 JSON 형식 오류 */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 유효한 Web 세션이 없음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 역할 또는 동일 출처 검증 거부 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 대상·본인 대상이 아님·잘못된 경로 UUID */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 마감·만료·검증 대기 또는 중복 상태 충돌 */
            409: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicConflictError"];
                };
            };
            /** @description 실제로 읽은 JSON 본문이 16KiB를 초과함 */
            413: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicTooLargeError"];
                };
            };
            /** @description 업로드 요청 예산을 초과함 */
            429: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    /** @description 재시도까지 기다릴 초 수입니다. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicRateLimitedError"];
                };
            };
            /** @description 기능 비활성·스토리지 처리 실패 또는 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUnavailableError"];
                };
            };
        };
    };
    createMyAssignmentUploadIntent: {
        parameters: {
            query?: never;
            header?: {
                /** @description 쿠키 요청에서는 요청 URL과 동일한 신뢰 출처가 필요합니다. 검증된 모바일 Bearer 요청은 생략할 수 있습니다. */
                Origin?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcademicUploadIntentInput"];
            };
        };
        responses: {
            /** @description 비공개 직접 업로드에 사용할 발급 정보 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUploadIntentResponse"];
                };
            };
            /** @description 허용되지 않은 입력 또는 JSON 형식 오류 */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 유효한 Web 세션이 없음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 역할 또는 동일 출처 검증 거부 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 대상·본인 대상이 아님·잘못된 경로 UUID */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 마감·만료·검증 대기 또는 중복 상태 충돌 */
            409: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicConflictError"];
                };
            };
            /** @description 실제로 읽은 JSON 본문이 16KiB를 초과함 */
            413: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicTooLargeError"];
                };
            };
            /** @description 업로드 요청 예산을 초과함 */
            429: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    /** @description 재시도까지 기다릴 초 수입니다. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicRateLimitedError"];
                };
            };
            /** @description 기능 비활성·스토리지 처리 실패 또는 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUnavailableError"];
                };
            };
        };
    };
    cancelMyAssignmentUploadIntent: {
        parameters: {
            query?: never;
            header?: {
                /** @description 쿠키 요청에서는 요청 URL과 동일한 신뢰 출처가 필요합니다. 검증된 모바일 Bearer 요청은 생략할 수 있습니다. */
                Origin?: string;
            };
            path: {
                /** @description 존재하지 않거나 허용되지 않은 대상과 잘못된 UUID는 동일한 404로 처리합니다. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcademicUploadSelectionInput"];
            };
        };
        responses: {
            /** @description 업로드 원장 취소 완료 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUploadCancelledResponse"];
                };
            };
            /** @description 허용되지 않은 입력 또는 JSON 형식 오류 */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 유효한 Web 세션이 없음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 역할 또는 동일 출처 검증 거부 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 대상·본인 대상이 아님·잘못된 경로 UUID */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 마감·만료·검증 대기 또는 중복 상태 충돌 */
            409: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicConflictError"];
                };
            };
            /** @description 실제로 읽은 JSON 본문이 16KiB를 초과함 */
            413: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicTooLargeError"];
                };
            };
            /** @description 기능 비활성·스토리지 처리 실패 또는 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUnavailableError"];
                };
            };
        };
    };
    verifyMyAssignmentUploadIntent: {
        parameters: {
            query?: never;
            header?: {
                /** @description 쿠키 요청에서는 요청 URL과 동일한 신뢰 출처가 필요합니다. 검증된 모바일 Bearer 요청은 생략할 수 있습니다. */
                Origin?: string;
            };
            path: {
                /** @description 존재하지 않거나 허용되지 않은 대상과 잘못된 UUID는 동일한 404로 처리합니다. */
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcademicUploadSelectionInput"];
            };
        };
        responses: {
            /** @description 비공개 PDF 검증 완료 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUploadVerifiedResponse"];
                };
            };
            /** @description 허용되지 않은 입력 또는 JSON 형식 오류 */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 유효한 Web 세션이 없음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 역할 또는 동일 출처 검증 거부 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 대상·본인 대상이 아님·잘못된 경로 UUID */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 마감·만료·검증 대기 또는 중복 상태 충돌 */
            409: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicConflictError"];
                };
            };
            /** @description 실제로 읽은 JSON 본문이 16KiB를 초과함 */
            413: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicTooLargeError"];
                };
            };
            /** @description 업로드 요청 예산을 초과함 */
            429: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    /** @description 재시도까지 기다릴 초 수입니다. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicRateLimitedError"];
                };
            };
            /** @description 기능 비활성·스토리지 처리 실패 또는 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUnavailableError"];
                };
            };
        };
    };
    exchangeAssignmentUploadProtocol: {
        parameters: {
            query?: never;
            header?: {
                /** @description 쿠키 요청의 토큰 발급에는 필수입니다. 검증된 모바일 Bearer 요청과 SDK 서명이 검증된 upload-completed callback은 생략할 수 있습니다. */
                Origin?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AcademicUploadProtocolInput"];
            };
        };
        responses: {
            /** @description SDK 클라이언트 토큰 또는 검증된 영수증 응답 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUploadProtocolResponse"];
                };
            };
            /** @description 허용되지 않은 입력 또는 JSON 형식 오류 */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 유효한 Web 세션이 없음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 역할 또는 동일 출처 검증 거부 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 대상·본인 대상이 아님·잘못된 경로 UUID */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 마감·만료·검증 대기 또는 중복 상태 충돌 */
            409: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicConflictError"];
                };
            };
            /** @description 실제로 읽은 JSON 본문이 16KiB를 초과함 */
            413: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicTooLargeError"];
                };
            };
            /** @description 업로드 요청 예산을 초과함 */
            429: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    /** @description 재시도까지 기다릴 초 수입니다. */
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicRateLimitedError"];
                };
            };
            /** @description 기능 비활성·스토리지 처리 실패 또는 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUnavailableError"];
                };
            };
        };
    };
    downloadAuthorizedSubmissionFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description 존재하지 않거나 허용되지 않은 대상과 잘못된 UUID는 동일한 404로 처리합니다. */
                id: string;
                /** @description 존재하지 않거나 허용되지 않은 대상과 잘못된 UUID는 동일한 404로 처리합니다. */
                fileId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 인가된 PDF의 보호 첨부 스트림 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    /** @description 원본명을 안전하게 인코딩한 attachment입니다. */
                    "Content-Disposition"?: string;
                    "Content-Length"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description 허용되지 않은 입력 또는 JSON 형식 오류 */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 유효한 Web 세션이 없음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 역할 또는 동일 출처 검증 거부 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 대상·본인 대상이 아님·잘못된 경로 UUID */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 기능 비활성·스토리지 처리 실패 또는 제공 불가 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AcademicUnavailableError"];
                };
            };
        };
    };
    downloadMemberGuidebookFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description 조회할 가이드북의 UUID입니다. 형식이 잘못되면 400을 반환합니다. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 허용된 가이드북 원본의 보호 첨부 스트림 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    /** @description 원본 파일명을 안전하게 인코딩한 attachment입니다. */
                    "Content-Disposition"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description 잘못된 경로 UUID 또는 query key */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 인증 주체가 없거나 Bearer가 유효하지 않거나 삭제·역할 변경으로 계정이 유효하지 않음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 승인 대기 PENDING 사용자에게 자료 조회 권한이 없음 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 가이드북 또는 허용되지 않은 저장 위치 */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 모바일 세션·인증 저장소 장애 또는 파일 저장소 설정·공급자 장애로 파일을 제공할 수 없음 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    listMemberClassMaterials: {
        parameters: {
            query?: {
                /** @description 1부터 시작하는 요청 페이지 번호입니다. pageSize와 계산한 OFFSET이 안전한 정수 범위를 넘으면 400으로 거부합니다. */
                page?: number;
                /** @description 한 번에 조회할 항목 수입니다. */
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 승인 회원에게 허용된 메타데이터 목록과 페이지 정보 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClassMaterialListResponse"];
                };
            };
            /** @description page/pageSize 입력 오류 또는 중복·미등록 query key */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 인증 주체가 없거나 Bearer가 유효하지 않거나 삭제·역할 변경으로 계정이 유효하지 않음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 승인 대기 PENDING 사용자에게 자료 조회 권한이 없음 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 모바일 세션·인증 저장소 장애 또는 자료 저장소 장애로 목록을 제공할 수 없음 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    getMemberClassMaterial: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description 조회할 강의자료의 UUID입니다. 형식이 잘못되면 400을 반환합니다. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 허용된 강의자료 상세 메타데이터 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClassMaterialDetailResponse"];
                };
            };
            /** @description 잘못된 경로 UUID 또는 query key */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 인증 주체가 없거나 Bearer가 유효하지 않거나 삭제·역할 변경으로 계정이 유효하지 않음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 승인 대기 PENDING 사용자에게 자료 조회 권한이 없음 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 강의자료 또는 현재 역할에 허용되지 않은 대상(MEMBER의 교수용 자료) */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 모바일 세션·인증 저장소 장애 또는 자료 저장소 장애로 상세를 제공할 수 없음 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    downloadMemberClassMaterialFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description 조회할 강의자료의 UUID입니다. 형식이 잘못되면 400을 반환합니다. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 허용된 강의자료 원본의 보호 첨부 스트림 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    /** @description 원본 파일명을 안전하게 인코딩한 attachment입니다. */
                    "Content-Disposition"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description 잘못된 경로 UUID 또는 query key */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 인증 주체가 없거나 Bearer가 유효하지 않거나 삭제·역할 변경으로 계정이 유효하지 않음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 승인 대기 PENDING 사용자에게 자료 조회 권한이 없음 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 강의자료·현재 역할에 허용되지 않은 대상 또는 허용되지 않은 저장 위치 */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 모바일 세션·인증 저장소 장애 또는 파일 저장소 설정·공급자 장애로 파일을 제공할 수 없음 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    listMemberWeeklyTexts: {
        parameters: {
            query?: {
                /** @description 1부터 시작하는 요청 페이지 번호입니다. pageSize와 계산한 OFFSET이 안전한 정수 범위를 넘으면 400으로 거부합니다. */
                page?: number;
                /** @description 한 번에 조회할 항목 수입니다. */
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 승인 회원에게 허용된 메타데이터 목록과 페이지 정보 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WeeklyTextListResponse"];
                };
            };
            /** @description page/pageSize 입력 오류 또는 중복·미등록 query key */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 인증 주체가 없거나 Bearer가 유효하지 않거나 삭제·역할 변경으로 계정이 유효하지 않음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 승인 대기 PENDING 사용자에게 자료 조회 권한이 없음 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 모바일 세션·인증 저장소 장애 또는 자료 저장소 장애로 목록을 제공할 수 없음 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    getMemberWeeklyText: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description 조회할 주차별 텍스트의 UUID입니다. 형식이 잘못되면 400을 반환합니다. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 허용된 주차별 텍스트 상세 메타데이터 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WeeklyTextDetailResponse"];
                };
            };
            /** @description 잘못된 경로 UUID 또는 query key */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 인증 주체가 없거나 Bearer가 유효하지 않거나 삭제·역할 변경으로 계정이 유효하지 않음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 승인 대기 PENDING 사용자에게 자료 조회 권한이 없음 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 주차별 텍스트 */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 모바일 세션·인증 저장소 장애 또는 자료 저장소 장애로 상세를 제공할 수 없음 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
    downloadMemberWeeklyTextFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description 조회할 주차별 텍스트의 UUID입니다. 형식이 잘못되면 400을 반환합니다. */
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description 허용된 주차별 텍스트 원본의 보호 첨부 스트림 */
            200: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    /** @description 원본 파일명을 안전하게 인코딩한 attachment입니다. */
                    "Content-Disposition"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description 잘못된 경로 UUID 또는 query key */
            400: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["InvalidInputError"];
                };
            };
            /** @description 인증 주체가 없거나 Bearer가 유효하지 않거나 삭제·역할 변경으로 계정이 유효하지 않음 */
            401: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnauthenticatedError"];
                };
            };
            /** @description 승인 대기 PENDING 사용자에게 자료 조회 권한이 없음 */
            403: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ForbiddenError"];
                };
            };
            /** @description 없는 주차별 텍스트·첨부 없음 또는 허용되지 않은 저장 위치 */
            404: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NotFoundError"];
                };
            };
            /** @description 모바일 세션·인증 저장소 장애 또는 파일 저장소 설정·공급자 장애로 파일을 제공할 수 없음 */
            503: {
                headers: {
                    "Cache-Control"?: "private, no-store";
                    Vary?: "Cookie, Authorization";
                    "X-Request-Id"?: string;
                    "X-Content-Type-Options"?: "nosniff";
                    "Content-Security-Policy"?: "sandbox; default-src 'none'";
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UnavailableError"];
                };
            };
        };
    };
}
