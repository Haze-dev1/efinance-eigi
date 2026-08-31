import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api, getSession, type Profile } from "./lib/api";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Module from "./pages/Module";
import Placement from "./pages/Placement";

type State =
  | { status: "loading" }
  | { status: "out" }
  | { status: "in"; profile: Profile };

/**
 * The signed-in profile, plus a way to refetch it.
 *
 * The refetch matters: routes are guarded on fields of this object (`placed`
 * gates /learn), so anything that changes those fields server-side must refresh
 * it here. Without that, finishing the placement quiz leaves `placed: false` in
 * memory and /learn redirects straight back to /placement.
 */
function useProfile(): [State, () => Promise<void>] {
  // Whether a token exists is known before the first render, so it is initial
  // state rather than an effect. Only the fetch it implies is asynchronous.
  const [state, setState] = useState<State>(() =>
    getSession() ? { status: "loading" } : { status: "out" },
  );

  const reload = useCallback(async () => {
    if (!getSession()) {
      setState({ status: "out" });
      return;
    }
    try {
      setState({ status: "in", profile: await api<Profile>("/me") });
    } catch {
      setState({ status: "out" });
    }
  }, []);

  useEffect(() => {
    if (!getSession()) return;
    void reload();
  }, [reload]);

  return [state, reload];
}

export default function App() {
  const [state, reloadProfile] = useProfile();

  if (state.status === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center font-data text-[0.65rem] uppercase tracking-[0.24em] text-muted">
        efinance
      </div>
    );
  }

  const signedIn = state.status === "in";
  const profile = signedIn ? state.profile : null;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home profile={profile} />} />
        <Route
          path="/join"
          element={
            signedIn ? <Navigate to="/learn" replace /> : <Auth mode="signup" />
          }
        />
        <Route
          path="/signin"
          element={
            signedIn ? <Navigate to="/learn" replace /> : <Auth mode="login" />
          }
        />

        {/* Placement gates the rest: an unplaced user has no track, so there is
            nothing sensible to show them on the dashboard. */}
        <Route
          path="/placement"
          element={
            signedIn ? (
              <Placement profile={profile} onPlaced={reloadProfile} />
            ) : (
              <Navigate to="/signin" replace />
            )
          }
        />
        <Route
          path="/learn"
          element={
            !signedIn ? (
              <Navigate to="/signin" replace />
            ) : !profile!.placed ? (
              <Navigate to="/placement" replace />
            ) : (
              <Dashboard profile={profile!} />
            )
          }
        />
        <Route
          path="/learn/:slug"
          element={
            !signedIn ? (
              <Navigate to="/signin" replace />
            ) : !profile!.placed ? (
              <Navigate to="/placement" replace />
            ) : (
              <Module profile={profile!} onProgress={reloadProfile} />
            )
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
