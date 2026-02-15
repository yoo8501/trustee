/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@trustee/ui",
    "@trustee/types",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "nextjs.org",
      },
    ],
  },
};

export default nextConfig;
