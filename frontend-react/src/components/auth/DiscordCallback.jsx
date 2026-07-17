// src/components/auth/DiscordCallback.jsx
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { clearStoredRef } from "../../utils/referralStorage";
import { syncCryptobotAuth } from "../../services/autotradeApi";

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
      navigate("/login?error=discord_auth_failed", { replace: true });
      return;
    }

    if (token && refreshToken) {
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

      navigate("/", { replace: true });
    } else {
      navigate("/login", { replace: true });
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
