import type { NextConfig } from "next";
import { execSync } from "child_process";

const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA ??
  (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "unknown"; } })();

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pdf-parse'],
  env: {
    NEXT_PUBLIC_COMMIT_SHA: commitSha,
    NEXT_PUBLIC_DEPLOYED_AT: new Date().toISOString(),
  },
};

export default nextConfig;
