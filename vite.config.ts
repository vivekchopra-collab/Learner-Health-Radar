import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import "dotenv/config"; // loads .env into process.env, server-side only
import { devApiPlugin } from "./server/devApiPlugin";

export default defineConfig({
  plugins: [react(), devApiPlugin()],
});
