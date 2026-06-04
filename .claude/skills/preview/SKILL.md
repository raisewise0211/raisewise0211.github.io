---
name: preview
description: Start a local MkDocs preview server (mkdocs serve) for the Robotics Notes site so changes can be viewed in a browser before committing.
---

로컬에서 사이트를 미리 본다.

1. 실행: `python3 -m mkdocs serve`
   - `mkdocs`가 PATH에 없을 수 있으므로 `python3 -m` 형태로 실행한다.
   - 의존성 미설치로 실패하면 안내: `pip install mkdocs-material pymdown-extensions` 후 재시도.
2. 기본 주소는 `http://127.0.0.1:8000` 이다. 서버는 백그라운드로 띄우고, 파일 저장 시 자동 리로드된다.
3. 다른 포트가 필요하면 `python3 -m mkdocs serve -a 127.0.0.1:<port>`.
