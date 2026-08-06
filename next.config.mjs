const path = await import('node:path')
const url = await import('node:url')
const __filename = url.fileURLToPath(import.meta.url)

const nextConfig = {
  webpack(config) {
    if (!config.cache) {
      config.cache = {}
    }

    config.cache.type = 'filesystem'
    config.cache.name = 'next-build-cache'
    config.cache.buildDependencies = {
      config: [__filename]
    }

    return config
  }
}

export default nextConfig
