# Behavior Tree (행동 트리)

Behavior Tree(BT)는 게임 AI에서 시작해 지금은 로보틱스(ROS2 Nav2), 자율주행, 산업 자동화의 **의사결정 로직 표준**으로 쓰이는 모델링 도구다.
"로봇이 다음에 무엇을 할지"를 트리 구조로 표현하고, 매 순간 트리를 위에서 아래로 훑는(Tick) 방식으로 동작을 결정한다.

이 커리큘럼은 결과의 90%를 만들어내는 핵심 30%에 집중한다 — 즉, 실무에서 실제로 반복해서 쓰는
**Tick 전파, 4대 노드 타입, Blackboard/Ports, Decorator, Reactive 실행모델, 커스텀 노드 작성**을 우선순위로 배치하고,
지엽적인 옵션들은 과감히 생략했다. 공식 문서 [behaviortree.dev](https://www.behaviortree.dev/)의 튜토리얼 순서를 참고해 재구성했다.

!!! info "학습 개요"
    - **분량**: 핵심 이론+실습 10세션 × 2시간 = 총 20시간
    - **흐름**: 왜 BT인가? → 4대 노드와 Tick → Blackboard/Ports → XML/툴체인 → Decorator → Reactive 실행모델 → Subtree 설계 → 커스텀 노드 → ROS2 실전 통합 → 종합 실습
    - **형식**: 매 세션 도입부에 "왜 이게 필요했는가"(원인-결과 분석) → 본문(고등학생도 이해 가능한 눈높이, 도식 위주) → 수식이 필요하면 별도 박스로 설명 → 마지막 15분 복습(다이어그램 채우기 + 퀴즈) → 다음 세션 예고
    - **참고 자료**: [behaviortree.dev 공식 문서](https://www.behaviortree.dev/), BehaviorTree.CPP v4 튜토리얼(t01~t16), ROS2 Nav2 BT Navigator

---

## 세션 로드맵

<div class="grid cards" markdown>

-   **1 · 왜 Behavior Tree인가?**

    ---

    유한상태기계(FSM)의 한계와 BT가 이를 어떻게 해결하는지, Tick이라는 개념이 왜 필요한지.

    [:octicons-arrow-right-24: 세션 1 시작](session-01-why-bt.md)

-   **2 · 4대 노드 타입과 Tick 전파**

    ---

    Control(Sequence/Fallback)·Decorator·Action·Condition, SUCCESS/FAILURE/RUNNING 상태 전파 메커니즘.

    [:octicons-arrow-right-24: 세션 2 시작](session-02-core-nodes.md)

-   **3 · Blackboard와 Ports**

    ---

    노드 간 데이터 공유 저장소 Blackboard, Input/Output Port, XML `{key}` 리매핑 문법.

    [:octicons-arrow-right-24: 세션 3 시작](session-03-blackboard-ports.md)

-   **4 · XML과 툴체인**

    ---

    XML로 트리 정의하기, BehaviorTree.CPP Factory 등록, Groot2로 시각화·모니터링.

    [:octicons-arrow-right-24: 세션 4 시작](session-04-xml-toolchain.md)

-   **5 · Decorator 노드 심화**

    ---

    Inverter·Retry·Timeout·ForceSuccess/Failure·RunOnce·Repeat, 재시도 횟수와 타임아웃의 수치 계산.

    [:octicons-arrow-right-24: 세션 5 시작](session-05-decorators.md)

-   **6 · Reactive 실행모델**

    ---

    Sequence vs ReactiveSequence, Fallback vs ReactiveFallback, Parallel 노드의 성공/실패 임계값.

    [:octicons-arrow-right-24: 세션 6 시작](session-06-reactive-execution.md)

-   **7 · Subtree와 설계 패턴**

    ---

    Subtree 포트 리매핑, 계층적 BT 설계 원칙, 재사용 가능한 모듈 구성법.

    [:octicons-arrow-right-24: 세션 7 시작](session-07-subtree-design.md)

-   **8 · 커스텀 노드 개발**

    ---

    SyncActionNode vs StatefulActionNode(비동기), halt() 처리, C++ 코드로 나만의 노드 만들기.

    [:octicons-arrow-right-24: 세션 8 시작](session-08-custom-nodes.md)

-   **9 · ROS2 실전 통합**

    ---

    Nav2 BT Navigator 구조, 실전 디자인 패턴과 안티패턴, Groot2 실시간 디버깅.

    [:octicons-arrow-right-24: 세션 9 시작](session-09-ros2-integration.md)

-   **10 · 종합 실습 & 통합**

    ---

    로봇 순찰 시나리오를 처음부터 설계, 전체 개념 지도 복습, 최종 퀴즈.

    [:octicons-arrow-right-24: 세션 10 시작](session-10-integration.md)

</div>
