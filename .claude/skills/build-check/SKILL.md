---
name: build-check
description: Build the MkDocs site in strict mode (mkdocs build --strict) to catch broken links, missing nav entries, and warnings before pushing. Use before pushing to main, since push auto-deploys.
---

push 전에 사이트 빌드를 검증한다. `main`에 push하면 GitHub Actions가 자동 배포하므로, push 전 마지막 점검 역할.

1. 실행: `python3 -m mkdocs build --strict`
   - `--strict`는 경고(끊긴 링크, nav에 없는 페이지 등)를 오류로 승격시킨다.
   - `mkdocs`가 PATH에 없을 수 있으므로 `python3 -m` 형태로 실행한다. 의존성 미설치 시: `pip install mkdocs-material pymdown-extensions`.
2. 오류/경고가 나면 원인 파일과 함께 한국어로 요약하고 고친다. nav 누락 경고가 보이면 `/sync-nav`를 제안한다.
3. 빌드 산출물 `site/`는 `.gitignore` 처리되어 있으니 커밋하지 않는다.
