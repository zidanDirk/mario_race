import {defineConfig} from 'vite';
export default defineConfig({
  // Keep built resources relative so the same dist works at a CDN subpath
  // such as /mario-race/ as well as at the origin root.
  base: './',
  server: {host: '127.0.0.1', port: 5173, strictPort: true, proxy: {'/api': 'http://127.0.0.1:3001'}},
  preview: {host: '127.0.0.1', port: 5173, strictPort: true, proxy: {'/api': 'http://127.0.0.1:3001'}},
});
