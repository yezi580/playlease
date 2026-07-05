import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isAppMode = mode === 'app'

  return {
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: isAppMode
          ? {
              main: resolve(__dirname, 'index.html')
            }
          : {
              main: resolve(__dirname, 'index.html'),
              admin: resolve(__dirname, 'admin.html')
            }
      }
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true
        },
        '/socket.io': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          ws: true
        }
      }
    }
  }
})
