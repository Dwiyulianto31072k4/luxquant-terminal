// src/components/auth/DiscordCallback.jsx
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { clearStoredRef } from "../../utils/referralStorage";
import { syncCryptobotAuth } from "../../services/autotradeApi";
import { consumePostLoginRedirect } from "../../utils/postLoginRedirect";
import { trackFunnel } from "../../utils/funnelAnalytics";
import { getStoredAcq } from "../../utils/acqAttribution";
import { authApi } from "../../services/authApi";
import { clearAuthRescueState, markFailedAuthProvider } from "../../utils/authRescue";

const DiscordCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    const refreshToken = params.get("refresh_token");
    const cryptobotToken = params.get("cryptobot_token");
    const userStr = params.get("user");
    const error = params.get("error");

    if (error) {
      console.error("Discord login error:", error);
      markFailedAuthProvider("discord");
      navigate("/login?error=discord_auth_failed", { replace: true });
      return;
    }

    if (token && refreshToken) {
      clearAuthRescueState();
      localStorage.setItem("access_token", token);
      localStorage.setItem("refresh_token", refreshToken);
      if (cryptobotToken) {
        syncCryptobotAuth(cryptobotToken);
      }

      if (userStr) {
        try {
          const user = JSON.parse(decodeURIComponent(userStr));
          setUser(user);
        } catch (e) {
          console.error("Failed to parse user data", e);
        }
      }

      // ─── Layer 6: clear pending referral after successful Discord login ───
      // Backend sudah ambil referral_code dari OAuth state param,
      // jadi localStorage udah ga butuh.
      clearStoredRef();

      trackFunnel("auth_success", {
        provider: "discord",
        source: "oauth_callback",
        meta: { is_new: params.get("is_new") === "1" },
      });
      const acq = getStoredAcq();
      if (acq) authApi.claimAcq(acq).catch(() => {});
      const dest = consumePostLoginRedirect("/home");
      trackFunnel("post_login_land", { path: dest, provider: "discord" });
      navigate(dest, { replace: true });
    } else {
      markFailedAuthProvider("discord");
      navigate("/login?error=discord_callback_missing_token", { replace: true });
    }
  }, [location, navigate, setUser]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "rgb(var(--surface))" }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-14 h-14">
          <div
            className="absolute inset-0 border-2 rounded-full"
            style={{ borderColor: "rgb(var(--accent) / 0.2)" }}
          />
          <div
            className="absolute inset-0 border-2 border-transparent rounded-full animate-spin"
            style={{ borderTopColor: "rgb(var(--accent))" }}
          />
        </div>
        <p className="text-sm font-medium" style={{ color: "rgb(var(--fg-muted))" }}>
          Menyelesaikan login Discord...
        </p>
      </div>
    </div>
  );
};

export default DiscordCallback;
