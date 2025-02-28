import { Hono } from "hono";
import { githubAuth } from "@hono/oauth-providers/github";
import { cors } from "hono/cors";

const app = new Hono<{
  Bindings: {
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    GITHUB_AUTO_COMMIT: KVNamespace; // Correct type for KV namespace
  };
}>();

// Enable CORS for all routes
app.use(cors());

// Middleware to inject env variables dynamically for GitHub OAuth
app.use("/github", (c, next) => {
  return githubAuth({
    client_id: c.env.GITHUB_CLIENT_ID,
    client_secret: c.env.GITHUB_CLIENT_SECRET,
    scope: ["public_repo", "read:user", "user:email"],
    oauthApp: true,
  })(c, next);
});

// Callback to retrieve token & user info
app.get("/github/callback", async (c) => {
  const query = c.req.query();
  console.log("Query params:", query);

  const code = query.code;
  if (!code) {
    return c.json({ error: "Authorization code is missing" }, 400);
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData: any = await tokenRes.json();
  console.log("GitHub Token Response:", {
    access_token: tokenData.access_token,
    scope: tokenData.scope,
    error: tokenData.error,
  });

  if (tokenData.error || !tokenData.access_token) {
    return c.json(
      { error: "Failed to retrieve access token", details: tokenData },
      400
    );
  }

  // Fetch User Info from GitHub API
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "Git-Auto-Committer",
      Accept: "application/vnd.github+json",
    },
  });

  console.log("User API Response Status:", userRes.status, userRes.statusText);

  if (!userRes.ok) {
    const errorText = await userRes.text();
    console.log("User API Error:", errorText);
    return c.json({
      error: "Failed to fetch user data",
      status: userRes.status,
      details: errorText,
    });
  }

  const userData: any = await userRes.json();
  console.log("User Data:", userData);

  // Store user data in KV
  await c.env.GITHUB_AUTO_COMMIT.put(
    `user:${userData.id}`,
    JSON.stringify({
      access_token: tokenData.access_token,
      username: userData.login,
      scopes: tokenData.scope.split(","),
    })
  );

  //checking for data
  // const writtenData = await c.env.GITHUB_AUTO_COMMIT.get(`user:${userData.id}`);
  // console.log("KV Write Result:", writtenData);

  // Return token, user info, and scopes to the frontend
  return c.json({
    token: tokenData.access_token,
    user: userData,
    scopes: tokenData.scope.split(","),
  });
});

export default app;
