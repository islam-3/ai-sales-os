/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB, too small for the knowledge_base media uploads
      // (short video clips) in app/dashboard/settings/actions.ts.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
