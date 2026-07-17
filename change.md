# Initial GitHub publication

Date: 2026-07-18

## Scope

Published the verified RevoMail frontend demo to the empty GitHub repository `luckykevvv/RevoMail` as its initial `main` branch commit.

## Changes

- Copied the application source, production server, package manifests, environment example, PM2 configuration, favicon, and README into the repository root.
- Excluded generated dependencies and build output through `.gitignore`.
- Archived the frontend implementation record as `change/change-1.md` because repository publication is a separate task.
- Kept the original presentation and course artifacts outside the Git repository.

## Commands used

```powershell
git status --short
git remote -v
git ls-files -v | Select-String '^S'
git ls-remote --symref https://github.com/luckykevvv/RevoMail.git HEAD
git -c http.proxy= -c https.proxy= ls-remote --heads https://github.com/luckykevvv/RevoMail.git
git -c http.proxy= -c https.proxy= clone https://github.com/luckykevvv/RevoMail.git RevoMail
Copy-Item <verified RevoMail source files> -Destination .
npm ci
npm run build
git add --all
git commit -m "feat: add interactive RevoMail frontend demo"
git -c http.proxy= -c https.proxy= push -u origin main
```

## Validation

- Remote repository was confirmed empty before the initial commit.
- `npm ci` and `npm run build` are required to pass before push.
- The pushed commit and remote `main` reference are verified after publication.
