import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@finalrun/common'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
