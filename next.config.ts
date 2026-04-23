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
    NEXT_PUBLIC_USE_ASYNC_PIPELINE: process.env.NEXT_PUBLIC_USE_ASYNC_PIPELINE ?? 'true',
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ?? 'https://interviewrubric.com',
  },
};

export default nextConfig;
