#!/usr/bin/env bash
set -euo pipefail

echo "[verify] Starting..."
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[verify] 1) Conflict markers"
if git grep -nE "^<<<<<<< |^=======|^>>>>>>>" -- . ":(exclude)docs" ":(exclude)*.md" | grep -v "docs/.*quote" | grep -v "verify.sh"; then
  echo "FAIL: Conflict markers found"
  exit 1
fi

echo "[verify] 2) node --check on tracked .js and .cjs"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    *.js|*.cjs) node --check "$f" || { echo "FAIL: node --check $f"; exit 1; } ;;
  esac
done < <(git ls-files)

echo "[verify] 3) Template damage scan"
# Look for broken patterns
if grep -rn "users//consents" --include="*.js" --include="*.cjs" . | grep -v node_modules; then
  echo "FAIL: Broken users//consents found"
  exit 1
fi
# Check for ${ outside backticks is hard to grep perfectly, but look for obvious breaks
if grep -rn "return \${" --include="*.js" --include="*.cjs" . | grep -v node_modules | grep -v "^\s*//"; then
  echo "FAIL: Suspect untemplate return"
  exit 1
fi

echo "[verify] 4) npm ci in root and functions"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  echo "WARN: no root package-lock.json"
fi
if [ -f functions/package-lock.json ]; then
  (cd functions && npm ci --no-audit --no-fund)
else
  echo "WARN: no functions/package-lock.json"
fi

echo "[verify] 5) Lint"
npm run lint --if-present || { echo "FAIL: root lint"; exit 1; }
(cd functions && npm run lint --if-present) || { echo "FAIL: functions lint"; exit 1; }

echo "[verify] 6) Build"
VITE_FIREBASE_API_KEY=dummy VITE_FIREBASE_AUTH_DOMAIN=dummy VITE_FIREBASE_PROJECT_ID=demo-test VITE_FIREBASE_STORAGE_BUCKET=dummy VITE_FIREBASE_MESSAGING_SENDER_ID=dummy VITE_FIREBASE_APP_ID=dummy npm run build || { echo "FAIL: build"; exit 1; }

echo "[verify] 7) Backend load test"
(cd functions && FIREBASE_CONFIG='\''{"projectId":"demo-test"}'\'' GCLOUD_PROJECT=demo-test node -e "require('\''./src/index.js'\'')" ) || { echo "FAIL: backend load"; exit 1; }

echo "[verify] 8) Jest in functions"
if [ -f functions/package.json ] && grep -q '"test"' functions/package.json; then
  (cd functions && npx jest --runInBand --passWithNoTests 2>&1 | tail -40) || { echo "FAIL: jest"; exit 1; }
else
  echo "No tests found"
fi

echo "[verify] 9) Legacy-host grep"
if grep -rn "netlify\|vercel\|yorubagpt\.netlify\.app" --include="*.js" --include="*.json" --include="*.yml" --include="*.yaml" --include="*.html" --include="*.md" . | grep -v node_modules | grep -v ".git" | grep -v "docs/" | grep -v "archive" | grep -v "package-lock.json"; then
  echo "FAIL: Legacy hosts found"
  exit 1
fi

echo "[verify] 10) git merge-tree against origin/main"
if git merge-tree --write-tree origin/main HEAD >/dev/null 2>&1; then
  :
else
  # Fallback
  git merge-tree $(git merge-base origin/main HEAD) origin/main HEAD 2>&1 | grep -q "^<<<<<<< " && { echo "FAIL: merge conflicts"; exit 1; }
fi

echo "[verify] ALL CHECKS PASSED"
