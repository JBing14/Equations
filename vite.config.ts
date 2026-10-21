import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// IMPORTANT: GitHub Pages serves a project site from /<repository-name>/.
// The repository is named "Equations", so the base path is "/Equations/".
// If you ever rename the repository, change REPO_NAME below (case-sensitive).
const REPO_NAME = 'Equations';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${REPO_NAME}/` : '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
