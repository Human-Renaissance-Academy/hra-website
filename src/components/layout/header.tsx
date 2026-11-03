"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Menu, X, LogIn, LogOut, ChevronDown, User } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

// 헤더가 실제 표시와 메뉴 분기에 사용하는 사용자 필드만 받습니다.
type SessionUser = {
  name?: string | null;
  email?: string | null;
  role?: "ADMIN" | "FACULTY" | "MEMBER" | "PENDING";
};

type HeaderProps = {
  session?: {
    user?: SessionUser;
  } | null;
};

type NavItem = {
  label: string;
  href?: string;
  subItems?: { label: string; href: string }[];
};

const navItems: NavItem[] = [
  {
    label: "소개",
    subItems: [
      { label: "HRA", href: "/about" },
      { label: "커리큘럼", href: "/curriculum" },
      { label: "교수진", href: "/faculty" },
      { label: "기수", href: "/cohorts" },
    ],
  },
  {
    label: "모집안내",
    href: "/recruitment",
  },
  {
    label: "소식",
    subItems: [
      { label: "공지사항", href: "/notices" },
      { label: "언론보도", href: "/press" },
      { label: "갤러리", href: "/gallery" },
    ],
  },
  {
    label: "커뮤니티",
    subItems: [
      { label: "수료생 이야기", href: "/alumni" },
      { label: "FAQ", href: "/faq" },
    ],
  },
];

export function Header({ session }: HeaderProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [openDesktopDropdown, setOpenDesktopDropdown] = useState<string | null>(null);
  const [openMobileDropdown, setOpenMobileDropdown] = useState<string | null>(null);
  // 모바일 메뉴 패널·하위 메뉴의 aria-controls 연결에 쓰는 안정적인 id 접두어
  const mobileMenuId = useId();
  // Escape 로 닫을 때 포커스를 되돌릴 모바일 메뉴 토글 버튼
  const mobileToggleRef = useRef<HTMLButtonElement>(null);

  const user = session?.user;
  const isLoggedIn = !!user;
  const isAdmin = user?.role === "ADMIN";
  const canAccessResources = user?.role === "ADMIN" || user?.role === "MEMBER" || user?.role === "FACULTY";

  /** 로그인 사용자에게만 자료실 메뉴 추가 */
  const visibleNavItems: NavItem[] = canAccessResources
    ? [...navItems, { label: "자료실", href: "/resources" }]
    : navItems;

  /**
   * 모바일 메뉴가 열려 있는 동안 뒤쪽 페이지 스크롤을 잠근다.
   *
   * 메뉴 패널은 헤더에 absolute 로 붙어 있어서, 잠그지 않으면 메뉴를 스크롤하려다
   * 뒤 페이지가 같이 밀려 내려가 메뉴가 화면 밖으로 사라지는 현상이 생긴다.
   * 언마운트 시에도 반드시 원복해야 하므로 cleanup 에서 overflow 를 되돌린다.
   */
  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /**
     * md(768px) 이상으로 화면이 넓어지면 모바일 메뉴 패널과 닫기(X) 버튼이 모두
     * md:hidden 으로 사라진다. 이때 mobileOpen 이 true 로 남아 있으면
     * body 스크롤이 잠긴 채 풀 수단이 없어져 페이지가 완전히 멈춘다.
     * (예: 세로 모드에서 메뉴를 연 뒤 가로로 회전, 데스크톱 창 넓히기)
     * 그래서 md 이상으로 넘어가는 순간 메뉴를 강제로 닫는다.
     */
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false);
    };
    desktopQuery.addEventListener("change", closeOnDesktop);

    /**
     * Escape 로 모바일 메뉴를 닫고 포커스를 토글 버튼으로 되돌린다.
     * 메뉴가 사라질 때 포커스가 body 로 떨어져 키보드 사용자가 길을 잃는 것을 막는다.
     */
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      mobileToggleRef.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      desktopQuery.removeEventListener("change", closeOnDesktop);
    };
  }, [mobileOpen]);

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    await signOut({ callbackUrl: "/" });
  };

  const isItemActive = (href?: string, subItems?: { href: string }[]) => {
    if (href && (pathname === href || pathname.startsWith(href + "/"))) return true;
    if (subItems?.some(sub => pathname === sub.href || pathname.startsWith(sub.href + "/"))) return true;
    return false;
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#D9D9D9]"
      onBlur={(event) => {
        // 모바일 메뉴가 열린 상태에서 포커스가 헤더 밖의 다른 요소로 옮겨가면 메뉴를 닫는다.
        // relatedTarget 이 null(창 전환·비포커스 영역 클릭)이면 닫지 않아 터치 탭 동작을 해치지 않는다.
        if (mobileOpen && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
          setMobileOpen(false);
        }
      }}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
         {/* 로고 — 모바일 메뉴가 열린 상태에서 눌러도 메뉴가 닫히도록 onClick 추가 */}
         <Link href="/" onClick={() => setMobileOpen(false)} className="text-xl font-bold tracking-tight text-gray-900">
           HRA
         </Link>

         <div className="hidden items-center gap-6 md:flex">
{visibleNavItems.map((item) => {
              const active = isItemActive(item.href, item.subItems);
             
             if (item.subItems) {
               return (
                 <div
                   key={item.label}
                   className="group relative py-6"
                   onMouseEnter={() => setOpenDesktopDropdown(item.label)}
                   onMouseLeave={(event) => {
                     if (!event.currentTarget.contains(document.activeElement)) setOpenDesktopDropdown(null);
                   }}
                   onFocusCapture={() => setOpenDesktopDropdown(item.label)}
                   onBlurCapture={(event) => {
                     if (!event.currentTarget.contains(event.relatedTarget)) setOpenDesktopDropdown(null);
                   }}
                   onKeyDown={(event) => {
                     if (event.key === "Escape") {
                       event.preventDefault();
                       event.currentTarget.querySelector("button")?.focus();
                       setOpenDesktopDropdown(null);
                     }
                   }}
                 >
                   <button
                     type="button"
                     aria-expanded={openDesktopDropdown === item.label}
                     aria-controls={`desktop-menu-${item.label}`}
                     onClick={() => setOpenDesktopDropdown(item.label)}
                     className={cn(
                       "flex items-center gap-1 text-sm font-medium tracking-wide transition-colors",
                        active ? "text-[#2563EB]" : "text-gray-600 group-hover:text-gray-900"
                     )}
                   >
                     {item.label}
                     <ChevronDown className="size-4 transition-transform group-hover:rotate-180" />
                   </button>
                    <div
                      id={`desktop-menu-${item.label}`}
                      className={cn(
                        "absolute top-full left-0 mt-0 w-48 transition-all duration-200",
                        openDesktopDropdown === item.label
                          ? "visible translate-y-1 opacity-100"
                          : "invisible opacity-0"
                      )}
                    >
                       <div className="rounded-md border border-[#D9D9D9] bg-white py-1 shadow-[var(--shadow-soft)]">
                       {item.subItems.map((sub) => {
                         const subActive = pathname === sub.href || pathname.startsWith(sub.href + "/");
                         return (
                           <Link
                             key={sub.href}
                             href={sub.href}
                             onClick={() => setOpenDesktopDropdown(null)}
                             className={cn(
                               "block px-4 py-2 text-sm transition-colors",
                                subActive ? "bg-blue-50 text-[#2563EB] font-semibold" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                             )}
                           >
                             {sub.label}
                           </Link>
                         );
                       })}
                     </div>
                   </div>
                 </div>
               );
             }

             return (
               <Link
                 key={item.label}
                 href={item.href!}
                 className={cn(
                   "text-sm font-medium tracking-wide transition-colors",
                    active ? "text-[#2563EB]" : "text-gray-600 hover:text-gray-900"
                 )}
               >
                 {item.label}
               </Link>
             );
           })}

           {isAdmin && (
             <Link
               href="/admin"
               className={cn(
                 "text-sm font-medium tracking-wide transition-colors",
                  pathname.startsWith("/admin") ? "text-[#2563EB]" : "text-gray-600 hover:text-gray-900"
               )}
             >
               관리자
             </Link>
           )}

            <div className="flex items-center gap-4 ml-2 border-l border-[#D9D9D9] pl-6">
             {isLoggedIn ? (
               <div className="relative">
                 <button
                   type="button"
                   onClick={() => setUserMenuOpen(!userMenuOpen)}
                   className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 hover:bg-gray-50"
                 >
                   <span>{user?.name || "사용자"}</span>
                   <ChevronDown className={cn("size-4 transition-transform", userMenuOpen && "rotate-180")} />
                 </button>

                 {userMenuOpen && (
                   <>
                     <div
                       className="fixed inset-0 z-40"
                       onClick={() => setUserMenuOpen(false)}
                       aria-hidden="true"
                     />
                       <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-[#D9D9D9] bg-white py-1 shadow-[var(--shadow-soft)]">
                        <div className="px-3 py-2 border-b border-[#D9D9D9]">
                         <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                          <p className="text-sm text-gray-500">{user?.email}</p>
                       </div>
                       <Link
                         href="/mypage"
                         onClick={() => setUserMenuOpen(false)}
                         className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                       >
                         <User className="size-4" />
                         마이페이지
                       </Link>
                       <button
                         type="button"
                         onClick={handleSignOut}
                         className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                       >
                         <LogOut className="size-4" />
                         로그아웃
                       </button>
                     </div>
                   </>
                 )}
               </div>
              ) : (
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                >
                  로그인·회원가입
                </Link>
              )}
             
             <Link
  href="/recruitment#apply-channels"
  className="ml-2 inline-flex items-center justify-center rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
>
  지원하기
</Link>
           </div>
         </div>

         <div className="flex items-center gap-3 md:hidden">
           {/* 지원하기 — 모바일 메뉴가 열린 채 이동하면 스크롤 잠금이 다음 페이지까지 따라가므로 여기서 닫는다 */}
           <Link
  href="/recruitment#apply-channels"
  onClick={() => setMobileOpen(false)}
  className="inline-flex items-center justify-center rounded-lg bg-[#2563EB] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
>
  지원하기
</Link>
           <button
             ref={mobileToggleRef}
             type="button"
             className="text-gray-900 p-2 -mr-2 flex items-center justify-center"
             onClick={() => setMobileOpen(!mobileOpen)}
             aria-expanded={mobileOpen}
             aria-controls={`${mobileMenuId}-panel`}
              aria-label="메뉴 열기/닫기"
           >
             {mobileOpen ? <X size={24} /> : <Menu size={24} />}
           </button>
         </div>
      </nav>

       {mobileOpen && (
         <div id={`${mobileMenuId}-panel`} className="border-t border-[#D9D9D9] bg-white md:hidden overflow-y-auto max-h-[calc(100vh-64px)] shadow-[var(--shadow-soft)] absolute w-full">
          <div className="flex flex-col px-4 py-4">
             {visibleNavItems.map((item, index) => {
               if (item.subItems) {
                const isOpen = openMobileDropdown === item.label;
                return (
                   <div key={item.label} className="border-b border-[#D9D9D9] last:border-none">
                    <button
                      type="button"
                      onClick={() => setOpenMobileDropdown(isOpen ? null : item.label)}
                      aria-expanded={isOpen}
                      aria-controls={`${mobileMenuId}-sub-${index}`}
                      className="flex w-full items-center justify-between py-4 text-left text-sm font-medium text-gray-900"
                    >
                      {item.label}
                      <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
                    </button>
                    {isOpen && (
                      <div id={`${mobileMenuId}-sub-${index}`} className="flex flex-col pb-4 pl-4 space-y-4">
                        {item.subItems.map((sub) => (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              "text-sm transition-colors",
                              pathname === sub.href || pathname.startsWith(sub.href + "/")
                                ? "text-[#2563EB] font-bold"
                                : "text-gray-600"
                            )}
                          >
                            {sub.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href!}
                  onClick={() => setMobileOpen(false)}
                   className="block border-b border-[#D9D9D9] py-4 text-sm font-medium text-gray-900 last:border-none"
                >
                  {item.label}
                </Link>
              );
            })}

            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileOpen(false)}
                className="block border-b border-[#D9D9D9] py-4 text-sm font-medium text-gray-900 last:border-none"
              >
                관리자
              </Link>
            )}

            <div className="mt-2 pt-4">
              {isLoggedIn ? (
                <div className="space-y-4 rounded-lg bg-gray-50 p-4 border border-[#D9D9D9]">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{user?.name || "사용자"}</p>
                    <p className="text-sm text-gray-500 mt-1">{user?.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href="/mypage"
                      onClick={() => setMobileOpen(false)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white border border-[#D9D9D9] py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      <User className="size-4" />
                      마이페이지
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex flex-1 items-center justify-center gap-2 rounded-md bg-white border border-[#D9D9D9] py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      <LogOut className="size-4" />
                      로그아웃
                    </button>
                  </div>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-white border border-[#D9D9D9] py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <LogIn className="size-4" />
                  로그인·회원가입
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
