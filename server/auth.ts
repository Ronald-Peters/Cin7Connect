import type { Express } from "express";
import session from "express-session";
import passport from "passport";
import { storage } from "./storage";

/**
 * What we store in the session cookie.
 * (Keep this small; never put secrets here.)
 */
export type SessionUser = {
  id: string;
  email: string;
  role?: string;
  customerId?: string | null;
};

// Using Postgres session store from storage.ts

/**
 * Call this once in server boot (you already do in routes/index.ts)
 */
export function setupAuth(app: Express) {
  // Replit / proxies need this so secure cookies work when you later enable HTTPS
  app.set("trust proxy", 1);

  // --- Session middleware backed by Postgres (Cloud Run compatible) ---
  app.use(
    session({
      // Use Postgres session store (production-ready)
      store: storage.sessionStore,
      name: "connect.sid",
      secret: process.env.SESSION_SECRET || "change-me-in-env",
      resave: false,
      saveUninitialized: false,
      cookie: {
        // 1 day
        maxAge: 1000 * 60 * 60 * 24,
        // Replit serves your API and frontend on same origin, so Lax is perfect
        sameSite: "lax",
        // Set true for production HTTPS (Cloud Run)
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
      },
    })
  );

  // --- Passport wiring (no LocalStrategy required for manual req.login) ---
  app.use(passport.initialize());
  app.use(passport.session());

  // We only need serialize/deserialize for req.login() to persist
  passport.serializeUser((user: any, done) => {
    // pick only safe, small fields into the session
    const safeUser: SessionUser = {
      id: String(user.id),
      email: user.email,
      role: user.role,
      customerId: user.customerId ?? null,
    };
    done(null, safeUser);
  });

  passport.deserializeUser((obj: SessionUser, done) => {
    // In a real app you might re-hydrate from DB; here we trust the session blob
    done(null, obj);
  });
}
