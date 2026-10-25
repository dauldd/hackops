import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/**': ['./docs/images/presenter.png'],
  },
};

export default nextConfig;
