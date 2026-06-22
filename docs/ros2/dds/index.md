# DDS (Data Distribution Service)

DDS는 ROS2 통신의 핵심 미들웨어 표준이다.
rosmaster 없는 **분산 발견(Discovery)**, **QoS 정책**, **RTPS 전송 계층**, 멀티머신 네트워킹까지
ROS2가 어떻게 노드끼리 데이터를 주고받는지를 이론 → 실전 순서로 10개 세션에 정리한다.

!!! info "학습 개요"
    - **분량**: 핵심 이론 10세션 (약 20시간 학습 분량)
    - **흐름**: 왜 DDS인가? → 발견/전송/QoS → rmw 구현체 → 네트워크 분리/멀티머신 → 보안 → 전체 통합
    - **형식**: 각 세션 끝에 핵심 Q&A와 **다음 세션 바로가기** 제공

---

## 세션 로드맵

<div class="grid cards" markdown>

-   **1 · 왜 DDS인가?**

    ---

    ROS1의 rosmaster 한계와 ROS2가 DDS를 택한 이유, 데이터 중심(Data-Centric) 통신 개념.

    [:octicons-arrow-right-24: 세션 1 시작](session-01-why-dds.md)

-   **2 · DCPS & Discovery**

    ---

    DomainParticipant/Publisher/DataWriter 계층, SPDP·SEDP 발견 동작 원리.

    [:octicons-arrow-right-24: 세션 2 시작](session-02-dcps-discovery.md)

-   **3 · RTPS 프로토콜**

    ---

    RTPS Message/Submessage 구조, HEARTBEAT/ACKNACK 신뢰성, 멀티캐스트 vs 유니캐스트.

    [:octicons-arrow-right-24: 세션 3 시작](session-03-rtps.md)

-   **4 · QoS 정책 마스터**

    ---

    Reliability·Durability·History, Deadline·Liveliness·Lifespan, QoS 호환성 매트릭스.

    [:octicons-arrow-right-24: 세션 4 시작](session-04-qos.md)

-   **5 · rmw 레이어**

    ---

    rmw 추상화 구조, Fast DDS vs CycloneDDS, RMW_IMPLEMENTATION 환경변수.

    [:octicons-arrow-right-24: 세션 5 시작](session-05-rmw.md)

-   **6 · Domain ID & Namespace**

    ---

    Domain ID로 논리적 네트워크 분리, 포트 번호 공식, Namespace·remapping.

    [:octicons-arrow-right-24: 세션 6 시작](session-06-domain-namespace.md)

-   **7 · DDS XML Profile**

    ---

    FASTRTPS_DEFAULT_PROFILES_FILE, 멀티캐스트 비활성화, Initial Peers 설정.

    [:octicons-arrow-right-24: 세션 7 시작](session-07-xml-profile.md)

-   **8 · 멀티머신 네트워킹**

    ---

    같은/다른 서브넷·VPN 통신 구성, 방화벽 포트 규칙, Wireshark 디버깅.

    [:octicons-arrow-right-24: 세션 8 시작](session-08-multimachine.md)

-   **9 · SROS2 보안**

    ---

    DDS Security 5플러그인, SROS2 keystore·Enclave·Permissions.

    [:octicons-arrow-right-24: 세션 9 시작](session-09-security.md)

-   **10 · 전체 통합 & 실전 시나리오**

    ---

    전체 개념 지도 리뷰, 로봇 함대 네트워크 설계, Discovery Server.

    [:octicons-arrow-right-24: 세션 10 시작](session-10-integration.md)

</div>
