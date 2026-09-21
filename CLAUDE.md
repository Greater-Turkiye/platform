# Repository rules — Greater-Turkiye/platform

Written for AI agents and for anyone new to the repository. The handbook is the authority; this file is the short operational version. Read it before the first edit of a session.

## 1. Keep the documentation true

**The README is part of the change, not an afterthought.**

- Any pull request that changes behaviour, structure, a map layer, a build step, a command, a dependency or a deployment step **must update `README.md` in the same pull request**.
- Map layers additionally update the layer table in `apps/web/README.md`, and new data sources update `apps/web/assets/LICENSES.md` plus the matching `apps/web/assets/data/*-SOURCES.md`.
- Never leave the README describing something that is no longer true. If a section becomes wrong, fix it in the same commit, even when the fix is unrelated to your task.
- Status words in the README table (`Live`, `Working`, `In progress`, `Draft`, `Planned`) are claims: only move a part forward when its code actually runs.
- Decisions that shape the project (data model, red lines, layers, infrastructure, governance) belong in a handbook ADR, and the README links to it rather than restating it.

## 2. Red lines that override any request

- Never publish positions, movements, deployments or order of battle of Turkish forces. Official presence stays at country level; officially announced operation areas are drawn as whole areas only (ADR 0013, ADR 0015).
- No classified or leaked material, no personal data, no field collection, no targeting language.
- If a request conflicts with a red line, say so, propose the closest compliant option, and change the rule only through a new ADR.

## 3. Data and sources

- Every map layer needs a sourced official document: a signed agreement, official coordinates, an official gazette, or a UN document. Anything constructed by us is labelled `schematic` and says so in its properties and in its `*-SOURCES.md` entry.
- Never copy third-party data whose licence does not allow it, and never trace geometry from copyrighted maps or screenshots.
- Builders in `tools/geo` must rebuild their output byte for byte, cache inputs outside the repository, and leave every other feature in the file untouched.
- Prefer primary sources (Resmî Gazete, TBMM, ministries, the UN) over media.

## 4. Web app conventions

- No build step and no bundler. Vendored libraries live in `apps/web/assets/vendor`; pin versions and record them in `LICENSES.md`.
- Shared helpers, i18n and data loading live in `assets/js/gt.js`; the globe in `home.js` + `ortho.js`; the dashboard in `panel.js`.
- All user-facing strings go through the i18n tables in `gt.js` with `data-i18n` attributes. Turkish first, English mirrored.
- Keep the still frames of the map visually stable: performance work may simplify moving frames, never the settled view.
- Verify before merging: serve the site locally, drive it with the CDP screenshot harness, and check both the screenshots and a clean console on desktop and at phone width.

## 5. Git and pull requests

- Never commit to `main`; `main` is protected. Work on a branch, open a pull request, squash-merge it.
- One PR per topic. Keep data changes and rendering changes separate where practical.
- Commit messages and PR bodies are in English and describe why.
- **No tool advertising anywhere in the repository.** No "Generated with", no `Co-Authored-By` for
  an assistant, no bot signature, in commit messages, pull request bodies, review comments, issue
  comments or code comments. The work is the project's; which editor or model produced a line is
  not a fact about the project and does not belong in its history. A comment explains the code, not
  who wrote it.
- Never commit secrets, tokens or private keys. Credentials belong in GitHub secrets, added by a human.

## 6. Closing a task

- End every finished task with a short, factual summary: what changed, what you verified and how, what is merged or deployed, and what is still open.
- Then offer the next steps as a numbered list (1, 2, 3), each one sentence, with your recommendation marked, so the owner can choose by number.
- Name anything the owner must do themselves (an account, a credential, a settings page) as its own option rather than burying it in prose.

## 7. Environment notes

- Windows PowerShell 5.1 is the default shell here: pass multi-line commit messages and PR bodies through files, and avoid `jq` expressions containing spaces.
- Python builders expect `shapely` and `pyproj`; collectors use `uv`.
