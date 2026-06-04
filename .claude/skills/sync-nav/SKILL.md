---
name: sync-nav
description: Find docs/**/*.md pages that are missing from the mkdocs.yml nav and add them under the right section. Use when new pages exist on disk but don't show up in the site navigation.
---

`docs/` 안의 `.md` 파일 중 `mkdocs.yml`의 `nav:`에 등록되지 않은 것을 찾아 추가한다. (nav는 수동 관리이므로 새 페이지가 누락되기 쉽다.)

## 절차

1. **목록 수집**: `docs/` 아래 모든 `.md`의 상대경로를 모은다.
   ```bash
   cd docs && find . -name '*.md' | sed 's|^\./||' | sort
   ```
2. **현재 nav 확인**: `mkdocs.yml`의 `nav:` 블록을 읽고 등록된 경로를 추린다.
3. **차집합 계산**: 디스크에는 있으나 nav에 없는 페이지를 가려낸다. (예: 현재 `ros2/cloud-control/*` 페이지들이 누락되어 있을 수 있다.)
4. **추가**: 각 누락 페이지를 폴더 구조에 맞는 섹션 아래에 추가한다. 들여쓰기 2칸, 중첩 유지. 적당한 표시 이름을 붙인다 (예: 파일의 H1 제목 또는 파일명 기반).
5. **검증**: 끝나면 `/build-check`를 권해 끊긴 항목이 없는지 확인한다.

누락된 페이지가 없으면 그 사실만 보고하고 끝낸다.
