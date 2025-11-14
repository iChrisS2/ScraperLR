export default {
  reactStrictMode: true,
  swcMinify: true,
  serverComponentsExternalPackages: ['playwright', 'crawlee', '@crawlee/playwright'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Excluir playwright y crawlee del empaquetado de webpack
      config.externals = config.externals || [];
      config.externals.push({
        'playwright': 'commonjs playwright',
        'crawlee': 'commonjs crawlee',
        '@crawlee/playwright': 'commonjs @crawlee/playwright',
        '@crawlee/browser': 'commonjs @crawlee/browser',
      });
    }
    return config;
  },
}
