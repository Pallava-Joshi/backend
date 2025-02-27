import { Hono } from "hono";
import authRoutes from "./auth";
const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/", (c) => {
  return c.text("Github Auto Committer Running!");
});

app.route("/auth", authRoutes);

export default app;
