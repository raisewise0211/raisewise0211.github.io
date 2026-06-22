# ROS2

ROS2는 로봇 소프트웨어를 만드는 미들웨어이자 생태계다.
이 섹션은 ROS2 기반 프레임워크와 패키지의 내부 동작을 **코드 수준에서** 분석하고,
직접 확장·커스터마이징하는 방향까지 정리한다.

---

## 구성

<div class="grid cards" markdown>

-   **Nav2** (Navigation2)

    ---

    ROS2의 표준 자율주행 내비게이션 스택.
    경로 계획, 경로 추종, 복구 행동을 플러그인 구조로 제공한다.

    [:octicons-arrow-right-24: MPPI Controller](nav2/mppi-controller.md)
    [:octicons-arrow-right-24: Lifecycle Manager](nav2/lifecycle-manager.md)

-   **DDS** (Data Distribution Service)

    ---

    ROS2 통신의 핵심 미들웨어 표준.
    rosmaster 없는 분산 발견, QoS 정책, RTPS 전송 계층, 멀티머신 네트워킹까지
    이론을 세션 단위로 정리한다.

    <span class="session-grid" markdown="1">
    [:octicons-arrow-right-24: 세션 1 - 왜 DDS인가?](dds/session-01-why-dds.md)
    [:octicons-arrow-right-24: 세션 2 - DCPS & Discovery](dds/session-02-dcps-discovery.md)
    [:octicons-arrow-right-24: 세션 3 - RTPS 프로토콜](dds/session-03-rtps.md)
    [:octicons-arrow-right-24: 세션 4 - QoS 정책 마스터](dds/session-04-qos.md)
    [:octicons-arrow-right-24: 세션 5 - rmw 레이어](dds/session-05-rmw.md)
    [:octicons-arrow-right-24: 세션 6 - Domain ID & Namespace](dds/session-06-domain-namespace.md)
    [:octicons-arrow-right-24: 세션 7 - DDS XML Profile](dds/session-07-xml-profile.md)
    [:octicons-arrow-right-24: 세션 8 - 멀티머신 네트워킹](dds/session-08-multimachine.md)
    [:octicons-arrow-right-24: 세션 9 - SROS2 보안](dds/session-09-security.md)
    [:octicons-arrow-right-24: 세션 10 - 전체 통합 & 실전 시나리오](dds/session-10-integration.md)
    </span>

-   **Isaac ROS Cloud Control**

    ---

    클라우드 플릿 관리와 로봇을 잇는 VDA5050 호환 Mission Client.
    MQTT 통신, 상태기계, Nav2 주행, 액션 핸들러 플러그인 구조를 코드 수준에서 분석한다.

    [:octicons-arrow-right-24: Overview](cloud-control/index.md)
    [:octicons-arrow-right-24: Mission Client](cloud-control/mission-client.md)
    [:octicons-arrow-right-24: Action Handlers](cloud-control/action-handlers.md)

</div>
