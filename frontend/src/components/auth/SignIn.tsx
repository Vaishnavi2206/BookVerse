import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { auth, googleProvider, signInWithPopup } from "../../shared/firebase";
import { useAuth } from "../../context/AuthContext";
import "./SignIn.css";

function SignIn() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [signingIn, setSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (user) {
      const state = location.state as { from?: { pathname?: string } } | null;
      navigate(state?.from?.pathname ?? "/dashboard", { replace: true });
    }
  }, [location.state, navigate, user]);

  const handleLogin = async () => {
    setSigningIn(true);
    setErrorMessage("");
    try {
      await signInWithPopup(auth, googleProvider);
      const state = location.state as { from?: { pathname?: string } } | null;
      navigate(state?.from?.pathname ?? "/dashboard", { replace: true });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Google sign-in failed."
      );
    } finally {
      setSigningIn(false);
    }
  };

  if (loading || user) {
    return (
      <main className="signin-page" aria-live="polite">
        <p className="signin-loading">Getting your reading space ready...</p>
      </main>
    );
  }

  return (
    <main className="signin-page">
      <section className="signin-card" aria-labelledby="signin-title">
        <span className="signin-mark" aria-hidden="true">
          <FontAwesomeIcon icon={faBookOpen} />
        </span>
        <p className="signin-eyebrow">YOUR PERSONAL READING SPACE</p>
        <h1 id="signin-title">Book Verse</h1>
        <p className="signin-description">
          Keep your next great read, reading goals, and favourite books all in
          one place.
        </p>
        {errorMessage && <p className="signin-error" role="alert">{errorMessage}</p>}
        <button
          className="signin-button"
          type="button"
          onClick={handleLogin}
          disabled={signingIn}
        >
          <span aria-hidden="true">G</span>
          {signingIn ? "Signing in..." : "Continue with Google"}
        </button>
        <p className="signin-footnote">Sign in to access your private library.</p>
      </section>
    </main>
  );
}

export default SignIn;