import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Note: suppressHydrationWarning should be used as a React prop on HTML elements, not in Next.js config
  experimental: {
    // Improve React 19 compatibility
    reactCompiler: false,
    // Better hydration handling
    optimizePackageImports: ['@payloadcms/ui'],
  },
  // Improve hydration stability
  reactStrictMode: false,
  // Better error handling for development
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Enable standalone output for Docker deployment
  // output: 'standalone',
  
  // Your Next.js config here
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
