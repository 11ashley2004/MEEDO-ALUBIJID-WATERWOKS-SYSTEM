const nextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;