import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync, existsSync, mkdirSync, copyFileSync, statSync } from 'fs';

// Helper to copy directory recursively
function copyDir(src: string, dest: string) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = resolve(src, entry);
    const destPath = resolve(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

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
  plugins: [
    {
      name: 'copy-assets-img',
      closeBundle() {
        const srcImg = resolve(__dirname, 'src/assets/img');
        const destImg = resolve(__dirname, 'dist/assets/img');
        if (existsSync(srcImg)) {
          copyDir(srcImg, destImg);
          console.log('Copied src/assets/img to dist/assets/img');
        }
      }
    }
  ]
});
