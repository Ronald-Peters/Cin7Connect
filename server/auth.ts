// server/auth.ts
import type { Express } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";

// minimal user shape stored in session
type AppUser = {
  id: string;
  email: string;
  name?: string;
  role?: string;
  customerId?: string | null;
};

export function setupAuth(app: Express) {
  // Make sure Express trusts the reverse proxy so "secure" cookies work on replit.app
  app.set("trust proxy", 1);

  // Session first (before passport.initialize / passport.session)
  app.use(
    session({
      name: "reivilo.sid",
      secret: process.env.SESSION_SECRET || "dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      rolling: true, // refresh expiry on activity
      cookie: {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        // On Replit the app is served over HTTPS, so mark cookies as secure in prod
        secure: process.env.NODE_ENV === "production",
        // SameSite rules:
        // - "lax" works best for same-origin app
        // - if you later front with a different domain for the frontend, switch to "none"
        sameSite: process.env.NODE_ENV === "production" ? "lax" : "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // ---------- Passport local strategy ----------
  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password", passReqToCallback: false },
      async (email, password, done) => {
        try {
          const user = await storage.findUserByEmail(email);
          if (!user) return done(null, false, { message: "Invalid credentials" });

          const ok = await storage.verifyPassword(user, password);
          if (!ok) return done(null, false, { message: "Invalid credentials" });

          const appUser: AppUser = {
            id: String(user.id),
            email: user.email,
            name: user.name || "",
            role: user.role || "user",
            customerId: user.customerId ? String(user.customerId) : null,
          };
          return done(null, appUser);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  // ---------- Session (de)serialization ----------
  passport.serializeUser((user: any, done) => {
    done(null, { id: user.id });
  });

  passport.deserializeUser(async (payload: any, done) => {
    try {
      const u = await storage.getUserById(payload.id);
      if (!u) return done(null, false);
      const appUser: AppUser = {
        id: String(u.id),
        email: u.email,
        name: u.name || "",
        role: u.role || "user",
        customerId: u.customerId ? String(u.customerId) : null,
      };
      done(null, appUser);
    } catch (e) {
      done(e);
    }
  });
}
