import { randomUUID } from "node:crypto";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as MagicLinkStrategy } from "passport-magic-link";
import sessionFileStore from "session-file-store";
import { AuthError } from "./errors";
import { getUserByEmail, insertUser } from "./users";
import { sendEmailViaSmtp } from "./email";

const sessionSecret = process.env.SESSION_SECRET as string;
const magicLinkSecret = process.env.MAGIC_LINK_SECRET as string;
const magicLinkBaseUrl = process.env.BASE_URL as string;

const FileStore = sessionFileStore(session);

passport.serializeUser((user, done) => {
  if (typeof user !== "object" || user === null || !("email" in user)) {
    done(null, false);
    return;
  }
  const email = user.email as string;
  done(null, email);
});

passport.deserializeUser(async (email, done) => {
  if (typeof email !== "string") {
    done(null, false);
    return;
  }
  const user = await getUserByEmail(email);
  done(null, user ?? false);
});

const strategy = new MagicLinkStrategy(
  {
    secret: magicLinkSecret,
    userFields: ["email"],
    tokenField: "token",
  },
  async (user, token) => {
    if (!user.email) {
      throw new Error("user does not have an email");
    }

    const magicLinkUrl = new URL("/auth/magiclink/callback", magicLinkBaseUrl);
    magicLinkUrl.searchParams.set("token", token);

    await sendEmailViaSmtp({
      subject: `Gatillo Magic Link`,
      to: user.email as string,
      content: `Magic link for ${user.email}: ${magicLinkUrl.toString()}`,
    });
    if (process.env.NODE_ENV !== "production") {
      console.log(`Magic link for ${user.email}: ${magicLinkUrl.toString()}`);
    }
  },
  async (userFields) => {
    const rawEmail = userFields.email;
    const email =
      typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

    if (!email) {
      return null;
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return existingUser;
    }

    const newUser = {
      id: randomUUID(),
      email,
    };
    await insertUser(newUser);
    return newUser;
  },
);
passport.use(strategy);

const fileStore =
  process.env.NODE_ENV === "production"
    ? undefined
    : new FileStore({
        path: "./sessions",
        ttl: 60 * 60 * 24,
      });

export const authMiddleware: express.Handler[] = [
  session({
    secret: sessionSecret,
    store: fileStore,
    resave: true,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  }),
  passport.initialize(),
  passport.session(),
];

const router = express.Router();

router.post(
  "/auth/magiclink",
  passport.authenticate("magiclink", { action: "requestToken" }),
  (_req, res) => {
    res.status(200).end();
  },
);

router.get(
  "/auth/magiclink/callback",
  passport.authenticate("magiclink", { action: "acceptToken" }),
  (req, res) => {
    res.redirect("/");
  },
);

router.get("/auth/status", (req, res) => {
  res.status(200).json({
    isAuthenticated: req.isAuthenticated(),
    user: req.user ?? null,
  });
});

router.post("/auth/logout", (req, res, next) => {
  req.logout((error) => {
    if (error) {
      next(error);
      return;
    }
    res.status(204).end();
  });
});

export const authRouter = router;

export function asyncHandler(
  fn: (req: express.Request, res: express.Response) => void,
) {
  const handler: express.Handler = async (req, res, next) => {
    try {
      await fn(req, res);
      // next(); don't call next because the request is terminated
    } catch (e) {
      next(e);
    }
  };

  return handler;
}

export const requireAuth: express.Handler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    next(new AuthError());
  } else {
    next();
  }
};
