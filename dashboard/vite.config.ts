import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/*
  GitHub Pages serves a project site from /<repo>/, not from the domain
  root, so every asset URL needs that prefix or the deployed page 404s on
  its own CSS and JS. The prefix is read from GITHUB_REPOSITORY (set by
  Actions) rather than hardcoded, so renaming the repo cannot silently
  break the deploy.

  Locally the variable is unset and base stays "/", so `npm run dev` and
  `npm run preview` behave exactly as before. Anything verifying the site
  at http://localhost:<port>/ keeps working unchanged.
*/
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];

// https://vite.dev/config/
export default defineConfig({
  base: repoName ? `/${repoName}/` : "/",
  plugins: [react(), tailwindcss()],
});
