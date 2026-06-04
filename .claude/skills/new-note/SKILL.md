---
name: new-note
description: Scaffold a new documentation page under docs/ and register it in the mkdocs.yml nav. Use when adding a new note/topic to the Robotics Notes site so it isn't forgotten from the navigation.
---

새 노트 페이지를 만들고 `mkdocs.yml` nav에 등록한다. `$ARGUMENTS`에는 보통 "섹션/주제" 또는 원하는 경로가 들어온다 (예: `ros2/nav2 BT Navigator`).

## 절차

1. **경로 결정**: `docs/` 아래 어느 섹션에 들어갈지 정한다. 기존 구조를 따른다 (`docs/math/`, `docs/papers/`, `docs/ros2/` 등). 섹션이 모호하면 사용자에게 한 번 확인한다. 파일명은 영어 kebab-case 권장 (예: `docs/ros2/nav2/bt-navigator.md`).

2. **페이지 생성**: 기존 문서 스타일을 그대로 따른다 (예: `docs/ros2/nav2/lifecycle-manager.md` 참고).
   - 최상단은 `# 제목` (H1). YAML front matter는 쓰지 않는다.
   - 본문은 한국어.
   - 시작 골격 예시:
     ```markdown
     # 제목

     !!! info "개요"
         - **항목**: 값

     ---

     ## 한 줄 요약

     > (핵심을 한 문장으로)

     ---

     ## 본문
     ```

3. **nav 등록**: `mkdocs.yml`의 `nav:` 블록에서 알맞은 섹션 아래에 항목을 추가한다. 들여쓰기는 2칸, 중첩 구조를 그대로 유지한다. 예:
   ```yaml
     - ROS2:
       - Nav2:
         - BT Navigator: ros2/nav2/bt-navigator.md
   ```

4. **검증 안내**: 마지막에 `/build-check` 실행을 권한다 (push하면 자동 배포되므로).
