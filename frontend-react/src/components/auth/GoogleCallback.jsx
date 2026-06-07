// src/components/auth/GoogleCallback.jsx
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  AUTOTRADE_REDIRECT_KEY,
  AUTOTRADE_REFRESH_TOKEN_KEY,
  AUTOTRADE_TOKEN_KEY,
  LUXQUANT_CRYPTOBOT_TOKEN_KEY,
} from "../../services/autotradeApi";

const GoogleCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();

  useEffect(() => {
    // ==========================================
    // 1. Kalau sudah ada token, langsung masuk
    // ==========================================
    const existingToken = localStorage.getItem(AUTOTRADE_TOKEN_KEY);

    if (existingToken) {
      navigate("/autotrade", {
        replace: true,
      });
      return;
    }

    // ==========================================
    // 2. Dev token (untuk development)
    // ==========================================
    const DEV_TOKEN = import.meta.env.VITE_DEV_AUTOTRADE_TOKEN;

    if (import.meta.env.DEV && DEV_TOKEN) {
      localStorage.setItem(AUTOTRADE_TOKEN_KEY, DEV_TOKEN);

      navigate("/autotrade", {
        replace: true,
      });

      return;
    }

    // ==========================================
    // 3. Google OAuth normal
    // ==========================================
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));

    const hashToken = hashParams.get("token");
    const hashRefreshToken = hashParams.get("refresh_token");

    if (hashToken) {
      localStorage.setItem(AUTOTRADE_TOKEN_KEY, hashToken);

      if (hashRefreshToken) {
        localStorage.setItem(AUTOTRADE_REFRESH_TOKEN_KEY, hashRefreshToken);
      } else {
        localStorage.removeItem(AUTOTRADE_REFRESH_TOKEN_KEY);
      }

      const redirectTo =
        localStorage.getItem(AUTOTRADE_REDIRECT_KEY) || "/autotrade";

      localStorage.removeItem(AUTOTRADE_REDIRECT_KEY);

      navigate(redirectTo, {
        replace: true,
      });

      return;
    }

    const params = new URLSearchParams(location.search);

    const token = params.get("token");
    const refreshToken = params.get("refresh_token");
    const cryptobotToken = params.get("cryptobot_token");
    const userStr = params.get("user");

    if (token && refreshToken) {
      localStorage.setItem("access_token", token);

      localStorage.setItem("refresh_token", refreshToken);

      if (cryptobotToken) {
        localStorage.setItem(LUXQUANT_CRYPTOBOT_TOKEN_KEY, cryptobotToken);
      }

      if (userStr) {
        try {
          const user = JSON.parse(decodeURIComponent(userStr));

          setUser(user);
        } catch (e) {
          console.error("Failed to parse user data", e);
        }
      }

      navigate("/", {
        replace: true,
      });
    } else {
      navigate("/login", {
        replace: true,
      });
    }
  }, [location, navigate, setUser]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0a0506" }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-14 h-14">
          <div
            className="absolute inset-0 border-2 rounded-full"
            style={{ borderColor: "rgba(212,168,83,0.2)" }}
          />
          <div
            className="absolute inset-0 border-2 border-transparent rounded-full animate-spin"
            style={{ borderTopColor: "#d4a853" }}
          />
        </div>
        <p className="text-sm font-medium" style={{ color: "#8a7a6e" }}>
          Menyelesaikan login Google...
        </p>
      </div>
    </div>
  );
};

export default GoogleCallback;
