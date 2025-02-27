import { Hono } from "hono";
import { githubAuth } from "@hono/oauth-providers/github";

const app = new Hono<{
  Bindings: {
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
  };
}>();

// Middleware to inject env variables dynamically
app.use("/github", (c, next) => {
  return githubAuth({
    client_id: c.env.GITHUB_CLIENT_ID, // Fetch from Cloudflare env
    client_secret: c.env.GITHUB_CLIENT_SECRET,
    scope: ["public_repo", "read:user", "user:email"],
    oauthApp: true,
  })(c, next);
});

// Callback to retrieve token & user info
app.get("/github/callback", async (c) => {
  const query = c.req.query();
  console.log(query);

  const code = query.code;

  if (!code) {
    return c.json({ error: "Authorization code is missing" }, 400);
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData: any = await tokenRes.json();
  console.log("GitHub Token Response:", tokenData);

  if (tokenData.error || !tokenData.access_token) {
    return c.json(
      { error: "Failed to retrieve access token", details: tokenData },
      400
    );
  }

  // Fetch User Info from GitHub API
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  console.log(userRes);

  //   const userData = await userRes.json();

  return c.json({
    token: tokenData.access_token,
    user: userRes,
  });
});

export default app;
