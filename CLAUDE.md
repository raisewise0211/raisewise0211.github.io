# 저장소 개요

`raisewise0211.github.io` — MkDocs(Material) 기반 개인 로보틱스 학습 노트. `docs/` 아래 마크다운 문서를 작성하면 GitHub Pages로 배포됨. `mkdocs.yml`의 `nav`에 새 문서를 반드시 등록해야 사이트에 노출된다.

푸시 전에는 `build-check` 스킬(`mkdocs build --strict`)로 깨진 링크/nav 누락을 확인할 것.

# 진행 중인 작업: ROS2 DDS 세션 실습 코드 추가

## 배경
`docs/ros2/dds/session-01-why-dds.md` ~ `session-10-integration.md` 까지 DDS 개념 학습 노트는 완료된 상태. 지금까지는 개념 설명·다이어그램 위주이고 실행 가능한 코드 예제는 거의 없음.

## 다음 단계
각 세션(1~10)에 대해:
1. 해당 세션 주제에 맞는 ROS2/DDS 예제 코드 작성 (Python rclpy 또는 C++ rclcpp, 필요시 순수 DDS API)
2. **로컬 우분투 환경(ROS2 설치됨)**에서 실제로 빌드/실행해서 검증 — 이 검증은 클라우드 세션에서는 불가 (ROS2 미설치, 격리 컨테이너)
3. 검증 통과한 코드 + 실행 로그/결과를 해당 `session-XX-*.md` 파일 맨 아래에 "## 실습: 검증 결과" 섹션으로 추가
4. 코드 원본은 `examples/dds/session-XX/` 디렉토리에 저장 (mkdocs `docs/` 밖이라 빌드에 영향 없음)

## 작업 방식 합의 사항
- 코드 작성·빌드·실행·검증은 **로컬(ROS2 설치된 우분투 환경)**에서 진행
- 클라우드 세션(이 환경)은 ROS2가 없으므로 코드 작성/리뷰/문서 정리는 가능하지만 실제 `colcon build`, `ros2 run` 등 실행 검증은 못 함
- 로컬 작업 시작 시 이 파일을 읽고 바로 이어서 진행할 것 (대화 맥락 재설명 불필요)
- 작업 완료된 세션은 아래 진행 상황 체크리스트에 표시

## 진행 상황
- [ ] 세션 1 - 왜 DDS인가? (예제: ROS1 vs ROS2 통신 비교 등)
- [ ] 세션 2 - DCPS & Discovery
- [ ] 세션 3 - RTPS 프로토콜
- [ ] 세션 4 - QoS 정책 마스터
- [ ] 세션 5 - rmw 레이어
- [ ] 세션 6 - Domain ID & Namespace
- [ ] 세션 7 - DDS XML Profile
- [ ] 세션 8 - 멀티머신 네트워킹
- [ ] 세션 9 - SROS2 보안
- [ ] 세션 10 - 전체 통합 & 실전 시나리오

각 세션 작업 완료 시 위 체크박스를 `[x]`로 바꾸고, 어떤 예제를 만들었는지 한 줄 메모를 남길 것.
