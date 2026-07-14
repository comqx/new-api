import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { defineConfig, loadEnv } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const semiUiDir = path.resolve(
  path.dirname(require.resolve('@douyinfe/semi-ui')),
  '../..',
)

/** Classic uses VChart 1.8.x; default workspace hoists VChart 2.x @visactor packages. */
function classicVisactorAliases(): Record<string, string> {
  const aliases: Record<string, string> = {}
  try {
    const vchartPkg = require.resolve('@visactor/vchart/package.json', {
      paths: [__dirname],
    })
    const nestedDir = path.join(path.dirname(vchartPkg), 'node_modules/@visactor')
    if (!fs.existsSync(nestedDir)) return aliases
    for (const name of fs.readdirSync(nestedDir)) {
      aliases[`@visactor/${name}`] = path.join(nestedDir, name)
    }
  } catch {
    /* classic deps missing during tooling */
  }
  return aliases
}

export default defineConfig(({ envMode }) => {
  const env = loadEnv({ mode: envMode, prefixes: ['VITE_'] })
  const clientServerUrl =
    process.env.VITE_REACT_APP_SERVER_URL ||
    env.rawPublicVars.VITE_REACT_APP_SERVER_URL ||
    ''
  const proxyServerUrl =
    clientServerUrl ||
    'http://localhost:3000'
  const isProd = envMode === 'production'
  const devProxy = Object.fromEntries(
    (['/api', '/mj', '/pg'] as const).map((key) => [
      key,
      { target: proxyServerUrl, changeOrigin: true },
    ]),
  ) as Record<string, { target: string; changeOrigin: boolean }>

  return {
    plugins: [pluginReact()],
    source: {
      entry: {
        index: './src/index.jsx',
      },
      define: {
        'import.meta.env.VITE_REACT_APP_SERVER_URL': JSON.stringify(
          clientServerUrl,
        ),
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@douyinfe/semi-ui/dist/css/semi.css': path.resolve(
          semiUiDir,
          'dist/css/semi.css',
        ),
        ...classicVisactorAliases(),
      },
    },
    html: {
      template: './index.html',
    },
    server: {
      host: '0.0.0.0',
      strictPort: false,
      proxy: devProxy,
    },
    output: {
      minify: isProd,
      target: 'web',
      distPath: {
        root: 'dist',
      },
    },
    performance: {
      removeConsole: isProd ? ['log'] : false,
      buildCache: {
        cacheDigest: [process.env.VITE_REACT_APP_VERSION],
      },
    },
    tools: {
      rspack: {
        module: {
          rules: [
            {
              test: /src[\\/].*\.js$/,
              type: 'javascript/auto',
              use: [
                {
                  loader: 'builtin:swc-loader',
                  options: {
                    jsc: {
                      parser: {
                        syntax: 'ecmascript',
                        jsx: true,
                      },
                      transform: {
                        react: {
                          runtime: 'automatic',
                          development: !isProd,
                          refresh: !isProd,
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  }
})
