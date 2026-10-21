# Equation Explorer

An interactive algebra equation visualizer for grades 6–9. Students drag a term across the equals sign; the app applies the inverse operation to **both** sides, shows the work in a new row underneath the matching terms (like paper algebra), and keeps a step-by-step history they can undo, redo and look back through.

Runs entirely in the browser: no login, no server, no tracking. Progress is saved in the browser (localStorage).

Features: exact fraction/decimal arithmetic, a dashed center divider that appears at the first move, hints (4 levels), 8 guided lessons, a seeded practice generator, custom equations, a balance scale, teacher tools (assignments, JSON import/export, printable sheet with answer key), keyboard and touch support.

---

## Put it on the web with GitHub (website only, no software needed)

You need a free GitHub account and the empty repository named **Equations**.

### 1. Unzip
Unzip `Equations.zip` on your computer. You will see a folder `Equations` containing `src`, `package.json`, `README.md` and more.

### 2. Upload the files
1. Open your repository: `https://github.com/<your-username>/Equations`.
2. Click **uploading an existing file** (or **Add file → Upload files**).
3. Open the unzipped folder, select **everything inside it** (Ctrl+A / Cmd+A), and drag it into the browser. Dragging folders keeps their structure.
4. Wait for all files to finish, then click **Commit changes** (leave "Commit directly to the main branch" selected).

### 3. The hidden `.github` folder (important)
The file that publishes the site is `.github/workflows/deploy.yml`. Folders starting with a dot are **hidden** on many computers, so it may not have been dragged in.

- **Windows:** in File Explorer choose **View → Show → Hidden items**.
- **Mac:** in Finder press **Cmd + Shift + .** (period).

Then check the repository page: if you do not see a `.github` folder, repeat step 2 and drag the `.github` folder in on its own. Alternative that always works: in the repository click **Add file → Create new file**, type `.github/workflows/deploy.yml` as the name (typing the slashes creates the folders), paste the contents of that file from the zip, and commit.

### 4. Turn on GitHub Pages
1. Repository **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

### 5. Watch it build
Open the **Actions** tab. The "Test and deploy to GitHub Pages" run takes a few minutes. A green check means it is live at:

`https://<your-username>.github.io/Equations/`

If the run was started before you set Source to GitHub Actions, open it and click **Re-run all jobs**.

### If a step fails (red X)
Click the failed run, open the red step, copy the error text, and paste it to Claude. Common causes: a file missing from the upload (especially `.github`), or Pages Source not set to GitHub Actions.

---

## Run on your own computer (optional)

Needs [Node.js](https://nodejs.org) 20 or newer.

```
npm install
npm run dev        # development server
npm test           # unit tests (math engine, history, state, storage)
npm run typecheck
npm run lint
npm run build      # production build into dist/
npm run test:e2e   # browser tests (first run: npx playwright install chromium)
```

The site lives at `/Equations/` when built. If you rename the repository, change `REPO_NAME` at the top of `vite.config.ts`.

## How it works

- `src/engine`: exact rational arithmetic (BigInt), a safe equation parser (no `eval`), the move rules, a solver that powers hints and worked solutions, and a seeded problem generator. Every move is re-checked to keep the solution unchanged.
- `src/history`: undo/redo; making a new move after undoing discards the abandoned redo branch.
- `src/state`: the workspace reducer (select, drag, drop, animate).
- `src/components`: the interface. `src/storage`: validated localStorage.
- Only linear equations in one variable (any single letter) are supported.

## Verification status (please read)
- The math engine, history, reducer and storage have 174 passing unit tests.
- The interface was exercised in real Chromium (drag and drop, undo/redo, reset, two-step and both-sides equations, no console errors, no horizontal scrolling at phone width).
- The build toolchain (Vite, TypeScript, ESLint, Vitest, Playwright) could not be installed in the environment where this was written, so those exact tools had not been run when this was packaged. The first GitHub Actions run is the real test. Lint is set to warn only so a style warning cannot block publishing.
