import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync } from 'fs';

// Get all HTML files in the src directory
const htmlFiles = readdirSync(resolve(__dirname, 'src')).filter(file => file.endsWith('.html'));
const input: Record<string, string> = {};
htmlFiles.forEach(file => {
  const name = file.replace('.html', '');
  input[name] = resolve(__dirname, 'src', file);
});

export default defineConfig({
  root: './src',
  build: {
    outDir: '../dist',
    minify: false,
    emptyOutDir: true,
    rollupOptions: {
      input
    }
  },
});
