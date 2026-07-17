import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";

function GoogleIcon() {
 return (
 <svg
 viewBox="0 0 24 24"
 className="h-[16px] w-[16px]"
 aria-hidden="true"
 >
 <path
 fill="#EA4335"
 d="M12 10.2v3.9h5.4c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.72-.06-1.41-.19-2.01H12z"
 />
 <path
 fill="#34A853"
 d="M12 22c2.76 0 5.07-.91 6.76-2.47l-3.3-2.56c-.91.61-2.08.97-3.46.97-2.66 0-4.91-1.8-5.72-4.22H2.88v2.65A10.2 10.2 0 0 0 12 22z"
 />
 <path
 fill="#4285F4"
 d="M6.28 13.72A6.13 6.13 0 0 1 5.96 12c0-.6.11-1.18.32-1.72V7.63H2.88A10.2 10.2 0 0 0 1.8 12c0 1.64.39 3.19 1.08 4.37l3.4-2.65z"
 />
 <path
 fill="#FBBC05"
 d="M12 6.06c1.5 0 2.84.52 3.9 1.53l2.92-2.92C17.06 3.03 14.75 2 12 2 7.98 2 4.5 4.3 2.88 7.63l3.4 2.65C7.09 7.86 9.34 6.06 12 6.06z"
 />
 </svg>
 );
}

export default function HeroSignupPill({
 text = "Start using LuxQuant today",
 className = "",
}) {
 const navigate = useNavigate();
 const { isAuthenticated } = useAuth();

 const goPlatform = () => {
 navigate(isAuthenticated ? "/home" : "/login");
 };

 return (
 <div
 className={[
 "mx-auto flex w-full max-w-[400px] items-center rounded-full border border-ink/20 bg-ink/[0.96] p-1 shadow-[0_10px_24px_rgb(var(--scrim) / 0.24)] backdrop-blur-md sm:max-w-[440px]",
 className,
 ].join(" ")}
 >
 <button
 type="button"
 onClick={goPlatform}
 className="min-w-0 flex-1 truncate rounded-full px-2.5 py-1.5 text-left text-[11px] font-medium text-surface-hover outline-none sm:px-4 sm:py-2 sm:text-[13px]"
 >
 {text}
 </button>

 <button
 type="button"
 onClick={goPlatform}
 className="ml-1.5 inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-accent-light via-accent to-accent-dark px-3.5 text-[11px] font-semibold text-surface-hover shadow-[0_5px_14px_rgb(var(--accent) / 0.22)] transition-all duration-300 hover:-translate-y-px hover:shadow-[0_8px_18px_rgb(var(--accent) / 0.35)] sm:h-9 sm:px-5 sm:text-[13px]"
 >
 Sign Up
 </button>

 <button
 type="button"
 onClick={goPlatform}
 aria-label="Continue with Google"
 className="ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/[0.08] bg-white shadow-[inset_0_1px_0_rgb(var(--ink)_/_0.9)] transition-transform duration-300 hover:scale-[1.05] sm:h-9 sm:w-9"
 >
 <GoogleIcon />
 </button>
 </div>
 );
}