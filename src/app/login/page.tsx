"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const REMEMBER_KEY = "crm_remember_account";

type FocusedField = "email" | "password" | null;

export default function LoginPage() {
  const router = useRouter();
  const characterStageRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      } else {
        setRemember(false);
      }
    } catch {
      // localStorage may be unavailable in restricted browser modes.
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    let animationFrame = 0;
    let pointerX = 0;
    let pointerY = 0;

    const updateCharacters = () => {
      animationFrame = 0;
      const stage = characterStageRef.current;
      if (!stage) return;

      const rect = stage.getBoundingClientRect();
      const normalizedX = Math.max(-1, Math.min(1, (pointerX - (rect.left + rect.width / 2)) / (rect.width / 2)));
      const normalizedY = Math.max(-1, Math.min(1, (pointerY - (rect.top + rect.height / 2)) / (rect.height / 2)));

      stage.style.setProperty("--look-x", `${normalizedX * 5}px`);
      stage.style.setProperty("--look-y", `${normalizedY * 4}px`);
      stage.style.setProperty("--lean", `${normalizedX * -5}deg`);
      stage.style.setProperty("--lean-soft", `${normalizedX * -3.5}deg`);
      stage.style.setProperty("--lean-softer", `${normalizedX * -2.5}deg`);
    };

    const handleMouseMove = (event: MouseEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(updateCharacters);
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;

    let blinkTimer = 0;
    let closeTimer = 0;

    const scheduleBlink = () => {
      blinkTimer = window.setTimeout(() => {
        const characters = characterStageRef.current?.querySelectorAll<HTMLElement>("[data-character]");
        if (characters?.length) {
          const character = characters[Math.floor(Math.random() * characters.length)];
          character.classList.add("is-blinking");
          closeTimer = window.setTimeout(() => character.classList.remove("is-blinking"), 150);
        }
        scheduleBlink();
      }, 2500 + Math.random() * 3500);
    };

    scheduleBlink();
    return () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(closeTimer);
    };
  }, [reducedMotion]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("账号或密码错误");
      } else {
        try {
          if (remember) {
            localStorage.setItem(REMEMBER_KEY, email);
          } else {
            localStorage.removeItem(REMEMBER_KEY);
          }
        } catch {
          // Ignore storage failures; authentication has already succeeded.
        }
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("登录失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const isFocused = focusedField !== null;

  return (
    <main className="min-h-screen bg-gray-50">
      <section className="min-h-screen lg:hidden flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <div className="text-center mb-8">
              <img
                src="/logo.png"
                alt="大川机床"
                className="mx-auto h-14 w-auto object-contain"
              />
              <p className="text-sm font-medium text-gray-600 mt-4">
                DachuanPro-CRM
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  账号
                </label>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="请输入账号"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密码
                </label>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="请输入密码"
                  required
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                记住账号
              </label>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "登录中..." : "登录"}
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="hidden min-h-screen lg:grid lg:grid-cols-[minmax(560px,1.08fr)_minmax(440px,0.92fr)]">
        <div
          className="relative flex min-h-screen flex-col overflow-hidden px-10 py-9 xl:px-14 xl:py-11"
          style={{ background: "linear-gradient(135deg,#a8531a,#ee7d2c)" }}
        >
          <div className="relative z-10">
            <div className="inline-flex flex-col">
              <div className="flex items-center text-2xl font-extrabold italic text-white">
                <span>Dachuan</span>
                <span className="ml-1 rounded-sm bg-white px-1.5 py-0.5 text-lg not-italic text-[#EE7D2C] shadow-sm">
                  .Pro
                </span>
              </div>
              <span className="mt-2 h-1 w-16 bg-white" />
            </div>
          </div>

          <div className="relative z-10 flex flex-1 items-end justify-center">
            <div
              ref={characterStageRef}
              className="character-stage relative h-[460px] w-full max-w-[660px]"
              data-focused={isFocused ? "true" : "false"}
              data-password-visible={showPassword ? "true" : "false"}
            >
              <div
                data-character
                className="character character-tall absolute bottom-0 left-[20%] z-10 h-[390px] w-[178px] origin-bottom rounded-t-[12px] bg-[#1f2937] shadow-[0_24px_50px_rgba(80,35,8,0.24)]"
                style={{
                  height: isFocused ? "430px" : "390px",
                  transform: showPassword
                    ? "translateX(18px) skewX(0deg)"
                    : isFocused
                      ? "translateX(32px) skewX(calc(var(--lean, 0deg) - 7deg))"
                      : "skewX(var(--lean, 0deg))",
                }}
              >
                <div
                  className={`character-eyes absolute left-1/2 top-12 flex -translate-x-1/2 gap-8 ${showPassword ? "eyes-closed" : ""}`}
                  style={{
                    transform: showPassword
                      ? "translateX(-50%)"
                      : "translate(calc(-50% + var(--look-x, 0px)), var(--look-y, 0px))",
                  }}
                >
                  <span className="eye eye-white"><i className={isFocused ? "look-toward-right" : ""} /></span>
                  <span className="eye eye-white"><i className={isFocused ? "look-toward-right" : ""} /></span>
                </div>
              </div>

              <div
                data-character
                className="character absolute bottom-0 left-[45%] z-20 h-[304px] w-[128px] origin-bottom rounded-t-[10px] bg-[#5B5C60] shadow-[0_20px_40px_rgba(80,35,8,0.2)]"
                style={{
                  transform: showPassword
                    ? "translateX(16px) skewX(7deg)"
                    : isFocused
                      ? "translateX(20px) skewX(calc(var(--lean, 0deg) + 6deg))"
                      : "skewX(var(--lean-soft, 0deg))",
                }}
              >
                <div
                  className="character-eyes absolute left-1/2 top-10 flex -translate-x-1/2 gap-6"
                  style={{
                    transform: showPassword
                      ? "translateX(calc(-50% + 14px))"
                      : "translate(calc(-50% + var(--look-x, 0px)), var(--look-y, 0px))",
                  }}
                >
                  <span className="eye eye-white">
                    <i className={showPassword ? "look-away-right" : isFocused ? "look-toward-left" : ""} />
                  </span>
                  <span className="eye eye-white">
                    <i className={showPassword ? "look-away-right" : isFocused ? "look-toward-left" : ""} />
                  </span>
                </div>
              </div>

              <div
                data-character
                className="character absolute bottom-0 left-[5%] z-30 h-[190px] w-[246px] origin-bottom rounded-t-[125px] bg-[#fbbf24] shadow-[0_18px_36px_rgba(80,35,8,0.2)]"
                style={{
                  transform: showPassword
                    ? "translateX(-12px) skewX(-5deg)"
                    : isFocused
                      ? "translateX(12px) skewX(var(--lean-soft, 0deg))"
                      : "skewX(var(--lean-softer, 0deg))",
                }}
              >
                <div
                  className="character-eyes absolute left-1/2 top-[84px] flex -translate-x-1/2 gap-9"
                  style={{
                    transform: showPassword
                      ? "translateX(calc(-50% - 18px))"
                      : "translate(calc(-50% + var(--look-x, 0px)), var(--look-y, 0px))",
                  }}
                >
                  <span className="eye-dot">
                    <i className={showPassword ? "look-away-left" : isFocused ? "look-toward-right" : ""} />
                  </span>
                  <span className="eye-dot">
                    <i className={showPassword ? "look-away-left" : isFocused ? "look-toward-right" : ""} />
                  </span>
                </div>
              </div>

              <div
                data-character
                className="character absolute bottom-0 right-[5%] z-40 h-[235px] w-[150px] origin-bottom rounded-t-[78px] border border-white/70 bg-[#f8fafc] shadow-[0_20px_42px_rgba(80,35,8,0.22)]"
                style={{
                  transform: showPassword
                    ? "translateX(12px) skewX(6deg)"
                    : isFocused
                      ? "translateX(-15px) skewX(var(--lean-soft, 0deg))"
                      : "skewX(var(--lean-soft, 0deg))",
                }}
              >
                <div
                  className="character-eyes absolute left-1/2 top-12 flex -translate-x-1/2 gap-7"
                  style={{
                    transform: showPassword
                      ? "translateX(calc(-50% + 18px))"
                      : "translate(calc(-50% + var(--look-x, 0px)), var(--look-y, 0px))",
                  }}
                >
                  <span className="eye-dot">
                    <i className={showPassword ? "look-away-right" : isFocused ? "look-toward-left" : ""} />
                  </span>
                  <span className="eye-dot">
                    <i className={showPassword ? "look-away-right" : isFocused ? "look-toward-left" : ""} />
                  </span>
                </div>
                <span className="absolute left-1/2 top-[104px] h-1 w-16 -translate-x-1/2 rounded-full bg-[#5B5C60]" />
              </div>
            </div>
          </div>

          <p className="relative z-10 mt-6 max-w-md text-sm leading-6 text-white/75">
            大川机床客户关系管理系统
          </p>
        </div>

        <div className="flex min-h-screen items-center justify-center bg-white px-10 py-12 xl:px-16">
          <div className="w-full max-w-[430px]">
            <div className="mb-10 flex items-center gap-4">
              <img
                src="/logo.png"
                alt="大川机床"
                className="h-14 w-auto max-w-[170px] object-contain"
              />
              <div className="border-l border-gray-200 pl-4">
                <h1 className="text-2xl font-bold text-[#1f2937]">大川机床</h1>
                <p className="mt-1 text-sm font-medium text-[#5B5C60]">Dachuan.Pro</p>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-3xl font-bold text-[#1f2937]">欢迎回来</h2>
              <p className="mt-2 text-sm text-[#5B5C60]">请输入账号和密码登录 CRM 系统</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="desktop-username" className="mb-2 block text-sm font-semibold text-[#1f2937]">
                  账号
                </label>
                <input
                  id="desktop-username"
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  className="h-12 w-full rounded-md border border-gray-300 bg-white px-3.5 text-sm text-gray-900 outline-none transition focus:border-[#EE7D2C] focus:ring-2 focus:ring-[#EE7D2C]/20"
                  placeholder="请输入账号"
                  required
                />
              </div>

              <div>
                <label htmlFor="desktop-password" className="mb-2 block text-sm font-semibold text-[#1f2937]">
                  密码
                </label>
                <div className="relative">
                  <input
                    id="desktop-password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    className="h-12 w-full rounded-md border border-gray-300 bg-white px-3.5 pr-12 text-sm text-gray-900 outline-none transition focus:border-[#EE7D2C] focus:ring-2 focus:ring-[#EE7D2C]/20"
                    placeholder="请输入密码"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-[#5B5C60] transition hover:text-[#EE7D2C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EE7D2C]"
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    title={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-[#5B5C60]">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-[#EE7D2C]"
                />
                记住账号
              </label>

              {error && (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center rounded-md bg-[#EE7D2C] text-sm font-semibold text-white transition hover:bg-[#d96d22] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EE7D2C] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {loading ? "登录中..." : "登录"}
              </button>
            </form>
          </div>
        </div>
      </section>

      <style jsx>{`
        .character,
        .character-eyes {
          transition:
            transform 520ms cubic-bezier(0.22, 1, 0.36, 1),
            height 520ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .eye {
          display: flex;
          width: 22px;
          height: 22px;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 999px;
          transition: height 120ms ease;
        }

        .eye-white {
          background: #ffffff;
        }

        .eye i,
        .eye-dot i {
          display: block;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #111827;
          transition: transform 240ms ease;
        }

        .eye-dot {
          display: flex;
          width: 14px;
          height: 14px;
          align-items: center;
          justify-content: center;
        }

        .eye-dot i {
          width: 12px;
          height: 12px;
          background: #1f2937;
        }

        .is-blinking .eye,
        .is-blinking .eye-dot {
          height: 2px;
          margin-top: 10px;
          background: #111827;
        }

        .is-blinking .eye i,
        .is-blinking .eye-dot i,
        .eyes-closed .eye i {
          opacity: 0;
        }

        .eyes-closed .eye {
          height: 2px;
          margin-top: 10px;
          background: #ffffff;
        }

        .look-away-left {
          transform: translateX(-5px);
        }

        .look-away-right {
          transform: translateX(5px);
        }

        .look-toward-left {
          transform: translate(-3px, 2px);
        }

        .look-toward-right {
          transform: translate(3px, 2px);
        }

        @media (prefers-reduced-motion: reduce) {
          .character,
          .character-eyes,
          .eye,
          .eye i,
          .eye-dot i {
            transition: none;
          }
        }
      `}</style>
    </main>
  );
}
