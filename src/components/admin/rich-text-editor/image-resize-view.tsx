"use client";

/**
 * 리치 텍스트 에디터 이미지 노드 뷰 (크기 조정 UI)
 *
 * 역할:
 * - 에디터 안의 이미지를 클릭(선택)하면 크기 프리셋·숫자 입력·드래그 핸들·삭제 버튼을 보여줍니다.
 * - 변경된 너비는 Tiptap `updateAttributes({ width })`로만 반영해 편집 상태·undo 기록을 Tiptap이 관리합니다.
 *
 * 사용 위치: `./extensions.ts`의 MarkdownImage 확장 `addNodeView()` (ReactNodeViewRenderer)
 */

import { useRef, useState } from "react";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** 이미지 크기 조정 프리셋 — null 은 "원본(크기 제한 없음)"을 의미한다 */
const SIZE_PRESETS = [
  { label: "25%", value: "25%" },
  { label: "50%", value: "50%" },
  { label: "75%", value: "75%" },
  { label: "원본", value: null },
] as const;

/**
 * 에디터 이미지 노드 뷰
 *
 * 이미지를 클릭(선택)하면:
 * - 상단에 크기 조정 툴바(프리셋 버튼 + 숫자 직접 입력) 플로팅 표시
 * - 오른쪽 가장자리에 드래그 핸들 표시 — 좌우로 드래그해 자유롭게 크기 조절
 * - 드래그 중에는 이미지 위에 현재 퍼센트 배지가 실시간으로 표시됨
 *
 */
export function ImageResizeView({ node, selected, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const attrs = node.attrs as { src: string; alt: string | null; width: string | null };

  // 숫자 입력 필드 상태 — "50%" → "50", null → ""
  const [customInput, setCustomInput] = useState<string>(() =>
    attrs.width ? attrs.width.replace("%", "") : ""
  );
  // 드래그 진행 중 여부
  const [isDragging, setIsDragging] = useState(false);
  // 드래그 중 실시간 너비 ("67%") — null이면 저장된 attrs.width 사용
  const [liveWidth, setLiveWidth] = useState<string | null>(null);

  // 이미지 컨테이너 ref — 드래그 시작 시 offsetWidth 및 부모 너비 측정
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);     // 드래그 시작 마우스 X 좌표
  const startWidthRef = useRef(0); // 드래그 시작 시 컨테이너 픽셀 너비

  // 입력값을 파싱해 width 속성 적용 (1~100 클램프, 빈값·0이면 원본)
  function applyCustomWidth(raw: string) {
    const num = parseInt(raw, 10);
    if (isNaN(num) || num <= 0) {
      updateAttributes({ width: null });
      setCustomInput("");
    } else {
      const clamped = Math.min(100, Math.max(1, num));
      updateAttributes({ width: `${clamped}%` });
      setCustomInput(String(clamped));
    }
  }

  // 프리셋 버튼 클릭 — TipTap 속성과 입력 필드를 동시에 업데이트
  // (useEffect로 attrs.width 변화를 감지하는 대신 직접 동기화해 cascading render 방지)
  function applyPreset(value: string | null) {
    updateAttributes({ width: value });
    setCustomInput(value ? value.replace("%", "") : "");
  }

  // 드래그 핸들 mousedown: document에 mousemove/mouseup을 달아 드래그 추적
  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    if (!container) return;

    startXRef.current = e.clientX;
    startWidthRef.current = container.offsetWidth;
    // 에디터 단락(부모 블록) 너비를 100% 기준으로 사용
    const parentWidth = container.parentElement?.offsetWidth ?? container.offsetWidth;
    setIsDragging(true);

    function onMouseMove(ev: MouseEvent) {
      const delta = ev.clientX - startXRef.current;
      const newPct = Math.min(100, Math.max(10, Math.round(((startWidthRef.current + delta) / parentWidth) * 100)));
      setLiveWidth(`${newPct}%`);
    }

    function onMouseUp(ev: MouseEvent) {
      const delta = ev.clientX - startXRef.current;
      const newPct = Math.min(100, Math.max(10, Math.round(((startWidthRef.current + delta) / parentWidth) * 100)));
      // 드래그 확정 시 TipTap 속성과 입력 필드 동시 업데이트
      updateAttributes({ width: `${newPct}%` });
      setCustomInput(String(newPct));
      setLiveWidth(null);
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  // 화면에 보여줄 너비: 드래그 중이면 실시간값, 아니면 저장된 값
  const displayWidth = liveWidth ?? attrs.width;

  return (
    <NodeViewWrapper className="relative my-4 block">
      {/* 크기 조정 툴바 + 삭제 버튼 — 선택되거나 드래그 중일 때 표시 */}
      {(selected || isDragging) && (
        <div className="absolute left-0 top-0 z-10 flex items-center gap-1 rounded-lg border border-[#D9D9D9] bg-white p-1 shadow-md">
          {SIZE_PRESETS.map(({ label, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => applyPreset(value)}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                (value === null && !attrs.width) || value === attrs.width
                  ? "bg-[#2563EB] text-white"
                  : "text-[#666666] hover:bg-gray-100 hover:text-[#1a1a1a]",
              )}
            >
              {label}
            </button>
          ))}
          <div className="mx-0.5 h-4 w-px bg-gray-200" />
          {/* 숫자 직접 입력 */}
          <div className="flex items-center gap-0.5">
            <input
              type="number"
              min={1}
              max={100}
              value={customInput}
              placeholder="직접"
              onChange={(e) => setCustomInput(e.target.value)}
              onBlur={(e) => applyCustomWidth(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyCustomWidth(customInput);
                }
              }}
              className="w-14 rounded border border-[#D9D9D9] px-1.5 py-1 text-xs text-[#1a1a1a] focus:border-[#2563EB] focus:outline-none"
            />
            <span className="text-xs text-[#666666]">%</span>
          </div>
          {/* 이미지 삭제 버튼 */}
          {selected && (
            <>
              <div className="mx-0.5 h-4 w-px bg-gray-200" />
              <button
                type="button"
                onClick={() => deleteNode()}
                className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                title="이미지 삭제"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}

      {/* 이미지 컨테이너 — 너비 스타일이 이 div에 적용되고 img는 항상 w-full */}
      <div
        ref={containerRef}
        className="relative inline-block"
        style={displayWidth ? { width: displayWidth } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attrs.src ?? ""}
          alt={attrs.alt ?? ""}
          draggable={false}
          className={cn(
            "block w-full rounded-xl border border-[#D9D9D9] shadow-sm",
            // 드래그 중 이미지 자체의 마우스 이벤트 차단 (핸들에서 포커스 벗어남 방지)
            isDragging && "pointer-events-none select-none",
          )}
        />

        {/* 드래그 중 현재 크기 배지 */}
        {isDragging && displayWidth && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
            <span className="rounded-md bg-black/60 px-3 py-1 text-sm font-semibold text-white">
              {displayWidth}
            </span>
          </div>
        )}

        {/* 오른쪽 상단 드래그 핸들 */}
        {(selected || isDragging) && (
          <div
            onMouseDown={handleResizeStart}
            className="absolute -right-1.5 -top-1.5 z-20 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded-full border border-[#D9D9D9] bg-white shadow-md hover:border-[#2563EB] hover:bg-blue-50"
          >
            <div className="h-2 w-2 rounded-sm border-r-2 border-t-2 border-gray-400" />
          </div>
        )}

      </div>
    </NodeViewWrapper>
  );
}
