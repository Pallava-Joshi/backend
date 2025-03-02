import { Hono } from "hono";
import authRoutes from "./auth";

const app = new Hono<{
  Bindings: {
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    GITHUB_AUTO_COMMIT: KVNamespace;
  };
}>();

app.get("/", (c) => {
  return c.text("Github Auto Committer Running!");
});

// Generate GitHub Actions workflow
app.post("/generate-workflow", async (c) => {
  const {
    userId,
    repoName, // User-specified name for the new repo
    frequency = "0 0 * * *",
    message = "Auto commit",
  } = await c.req.json();
  console.log("Request Body:", { userId, repoName, frequency, message });

  // Validate repoName
  if (
    !repoName ||
    typeof repoName !== "string" ||
    !/^[a-zA-Z0-9-]+$/.test(repoName)
  ) {
    return c.json(
      {
        error:
          "Invalid repoName. Use alphanumeric characters and hyphens only.",
      },
      400
    );
  }

  const userDataRaw = await c.env.GITHUB_AUTO_COMMIT.get(`user:${userId}`);
  console.log("KV Raw Data:", userDataRaw);
  if (!userDataRaw) return c.json({ error: "User not found" }, 404);

  const userData = JSON.parse(userDataRaw);
  console.log("User Data:", userData);

  // Create a new repository from the template
  const createRepoRes = await fetch(
    `https://api.github.com/repos/Pallava-Joshi/auto-commit-template/generate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userData.access_token}`,
        "User-Agent": "Git-Auto-Committer",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        owner: userData.username, // The authenticated user
        name: repoName, // Name for the new repo
        description: "Auto-generated repo for GitHub Auto Commit",
        private: false,
        include_all_branches: false, // Only include the default branch
      }),
    }
  );

  const createRepoData = await createRepoRes.json();
  console.log("Create Repo Response:", {
    status: createRepoRes.status,
    data: createRepoData,
  });
  if (!createRepoRes.ok) {
    return c.json({
      error: "Failed to create repository from template",
      details: createRepoData,
    });
  }

  // Since the new repo is created synchronously, customize the commit.yml file
  const workflowYaml = `
name: Auto Commit
on:
  schedule:
    - cron: '${frequency}' # e.g., daily at midnight
jobs:
  commit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: echo "Auto commit $(date)" >> README.md
      - uses: stefanzweifel/git-auto-commit-action@v4
        with:
          commit_message: "${message}"
  `;
  const content = btoa(workflowYaml);

  // Get the SHA of the existing commit.yml file
  const existingFileRes = await fetch(
    `https://api.github.com/repos/${userData.username}/${repoName}/contents/.github/workflows/commit.yml`,
    {
      headers: {
        Authorization: `Bearer ${userData.access_token}`,
        "User-Agent": "Git-Auto-Committer",
        Accept: "application/vnd.github+json",
      },
    }
  );
  const existingFileData: any = await existingFileRes.json();
  console.log("Existing File Check:", {
    status: existingFileRes.status,
    data: existingFileData,
  });
  if (!existingFileRes.ok && existingFileRes.status !== 404) {
    return c.json({
      error: "Failed to check existing workflow file",
      details: existingFileData,
    });
  }

  // Update the commit.yml file
  const updateFileRes = await fetch(
    `https://api.github.com/repos/${userData.username}/${repoName}/contents/.github/workflows/commit.yml`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${userData.access_token}`,
        "User-Agent": "Git-Auto-Committer",
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        message: "Update auto-commit workflow with user settings",
        content,
        sha: existingFileRes.status === 200 ? existingFileData.sha : undefined, // Include SHA if file exists
      }),
    }
  );

  const updateFileData = await updateFileRes.json();
  console.log("Update File Response:", {
    status: updateFileRes.status,
    data: updateFileData,
  });
  if (!updateFileRes.ok) {
    return c.json({
      error: "Failed to update workflow file",
      details: updateFileData,
    });
  }

  return c.json({
    success: true,
    repoUrl: `https://github.com/${userData.username}/${repoName}`,
    message: `Repository ${repoName} created successfully with auto-commit workflow. Visit ${userData.username}/${repoName} to see it.`,
  });
});

app.route("/auth", authRoutes);

export default app;
