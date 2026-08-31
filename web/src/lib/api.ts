// The session token from Supabase. Kept in localStorage so a refresh does not
// sign the user out; the server re-verifies it on every request regardless.
const TOKEN_KEY = "efinance.session";

export type Session = { access_token: string; expires_at?: number };

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — the session simply will not persist across reloads */
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    // A rejected token means the session is spent; clear it so the app routes
    // back to sign-in instead of retrying forever.
    if (res.status === 401) setSession(null);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(
      res.status,
      body.error ?? `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

export type Profile = {
  id: string;
  email: string;
  track: "beginner" | "intermediate" | "advanced" | null;
  xp: number;
  tier: "free" | "pro";
  placed: boolean;
};

export type Topic = { id: string; order: number; title: string; blurb: string };

export type ModuleMeta = {
  slug: string;
  topic: string;
  chapter: number;
  title: string;
  summary: string;
  track: "beginner" | "intermediate" | "advanced";
  order: number;
  xp: number;
  minutes: number;
  sources: { title: string; url: string }[];
  completed?: boolean;
  /** XP actually earned, present once the module is completed. */
  xpEarned?: number | null;
};

export type PublicQuestion =
  | { id: string; kind: "mcq"; prompt: string; choices: string[] }
  | { id: string; kind: "true_false"; prompt: string }
  | { id: string; kind: "long_answer"; prompt: string; maxScore: number };

export type PublicQuiz = { slug: string; questions: PublicQuestion[] };

/** One marked objective question, as shown on the results page. */
export type QuestionReview = {
  id: string;
  kind: "mcq" | "true_false";
  prompt: string;
  correct: boolean;
  given: string | null;
  expected: string;
  explanation: string;
};

export type AttemptResult = {
  attemptKey: string;
  moduleSlug: string;
  objective: { score: number; max: number };
  review: QuestionReview[];
  longAnswer: {
    status: "pending" | "graded" | "failed";
    prompt: string | null;
    response: string;
    score: number | null;
    max: number;
    feedback: string | null;
  };
  xpAwarded: number;
};

export type ModulesResponse = {
  track: Profile["track"];
  xp: number;
  topics: Topic[];
  modules: ModuleMeta[];
};

export type PlacementResult = {
  track: NonNullable<Profile["track"]>;
  score: number;
  max: number;
  review: QuestionReview[];
};
