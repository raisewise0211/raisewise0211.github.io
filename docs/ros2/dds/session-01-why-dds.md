# 세션 1: 왜 DDS인가? — ROS1 vs ROS2 아키텍처

    - **핵심 목표**: DDS가 존재하는 이유와 ROS2 전체 레이어 구조 파악
    - **관련 표준**: OMG DDS 1.4, RTPS 2.3

---

## 한 줄 요약

> ROS1은 중앙 마스터(rosmaster) 단일 장애점과 QoS 부재로 실제 로봇 시스템에 한계가 있었고, ROS2는 이를 해결하기 위해 OMG 표준 미들웨어인 **DDS(Data Distribution Service)**를 통신 기반으로 채택했다.

---

## ROS1의 한계

| 문제 | 설명 |
|------|------|
| **단일 장애점** | `rosmaster`가 죽으면 전체 시스템 통신 불가 |
| **TCP 고정** | 모든 통신이 TCP 기반, UDP/멀티캐스트 사용 불가 |
| **QoS 없음** | 메시지 신뢰성, 우선순위, 수명 등 제어 수단 없음 |
| **보안 없음** | 노드 간 인증·암호화 메커니즘 부재 |
| **멀티머신 불안정** | 네트워크 설정 복잡, 자동 발견(discovery) 없음 |

---

## ROS2 레이어 구조

ROS2는 통신 계층을 완전히 새로 설계했다. 개발자가 직접 DDS를 다룰 필요 없도록 추상화 레이어를 여러 단계로 나눴다.

```
┌─────────────────────────────────────┐
│         ROS2 Application            │  ← 개발자가 작성하는 노드
├─────────────────────────────────────┤
│       rclcpp / rclpy                │  ← ROS2 클라이언트 라이브러리
├─────────────────────────────────────┤
│   rcl (ROS Client Library C API)    │  ← 언어 독립적 공통 레이어
├─────────────────────────────────────┤
│   rmw (ROS Middleware Interface)    │  ← DDS 추상화 인터페이스
├─────────────────────────────────────┤
│  DDS 구현체 (Fast DDS / CycloneDDS) │  ← 실제 통신 엔진
├─────────────────────────────────────┤
│         RTPS / UDP                  │  ← 네트워크 전송
└─────────────────────────────────────┘
```

### 각 레이어 역할

| 레이어 | 역할 | 예시 |
|--------|------|------|
| `rclcpp/rclpy` | 언어별 고수준 API 제공 | `Node`, `Publisher`, `Subscriber` |
| `rcl` | C API로 공통 동작 정의 | `rcl_node_t`, `rcl_publisher_t` |
| `rmw` | DDS 구현체를 교체 가능하게 추상화 | `rmw_publish()`, `rmw_create_node()` |
| DDS 구현체 | 실제 발견·통신·QoS 처리 | Fast DDS, CycloneDDS, RTI Connext |
| RTPS/UDP | 네트워크 패킷 송수신 | 멀티캐스트 발견, 유니캐스트 데이터 전송 |

---

## DDS란 무엇인가?

**DDS(Data Distribution Service)**는 OMG(Object Management Group)가 정의한 **데이터 중심 발행-구독(DCPS)** 미들웨어 표준이다.

### DDS를 선택한 이유

```
rosmaster 방식 (중앙 집중)          DDS 방식 (분산)
─────────────────────               ─────────────────────
    [rosmaster]                     노드A ←→ 노드B
    /    |    \                        ↕         ↕
  노드A 노드B 노드C                 노드C ←→ 노드D
  
  ✗ 마스터 죽으면 전부 중단        ✓ 마스터 없음, P2P 자동 발견
  ✗ QoS 제어 불가                  ✓ QoS 정책 세밀 제어
  ✗ 보안 없음                      ✓ 인증·암호화 플러그인
  ✗ 실시간 보장 불가               ✓ Deadline, Liveliness 정책
```

### DDS 핵심 특성

- **분산(Decentralized)**: 중앙 서버 없이 노드끼리 직접 발견하고 통신
- **데이터 중심**: 노드가 아닌 **Topic(데이터 타입)** 기준으로 연결
- **QoS 기반**: 신뢰성, 내구성, 타이밍 등 세밀한 통신 품질 제어
- **표준 기반**: OMG 국제 표준 → 벤더 교체 가능

---

## ROS1 vs ROS2 비교

| 항목 | ROS1 | ROS2 |
|------|------|------|
| 발견 방식 | rosmaster 중앙 등록 | DDS SPDP/SEDP 자동 발견 |
| 전송 프로토콜 | TCP (TCPROS) | UDP 기반 RTPS |
| QoS | 없음 | Reliability, Durability 등 10종 |
| 보안 | 없음 | DDS Security 플러그인 (SROS2) |
| 실시간성 | 제한적 | Deadline, Liveliness 정책 |
| 멀티머신 | 수동 설정 복잡 | 자동 발견 (같은 서브넷) |
| 미들웨어 교체 | 불가 | rmw로 런타임 교체 가능 |

---

## 핵심 개념 정리

!!! tip "이 세션의 핵심 3가지"
    1. **ROS2는 rosmaster를 없앴다** → DDS의 분산 발견이 대체
    2. **rmw 레이어** 덕분에 DDS 구현체를 교체해도 코드 변경 불필요
    3. **DDS = OMG 국제 표준** → 산업용 로봇·자율주행에서 이미 검증된 기술

---

## 복습 (15분)

### ROS2 레이어 다이어그램 직접 그리기

아래 빈칸을 채워보세요:

```
[ _____________ / _____________ ]  ← 언어별 API
[ _____________ ]                  ← C API 공통 레이어
[ _____________ ]                  ← DDS 추상화 인터페이스
[ _____________ / _____________ ]  ← 실제 DDS 구현체
[ _____________ / _____________ ]  ← 전송 계층
```

??? success "정답"
    ```
    [ rclcpp / rclpy ]   ← 언어별 API
    [ rcl ]              ← C API 공통 레이어
    [ rmw ]              ← DDS 추상화 인터페이스
    [ Fast DDS / CycloneDDS ]  ← 실제 DDS 구현체
    [ RTPS / UDP ]       ← 전송 계층
    ```

### 퀴즈

!!! question "Q1"
    ROS1에서 `rosmaster`가 죽으면 어떻게 되는가?

??? success "정답"
    모든 노드 간 통신이 불가능해진다. 새로운 발행자·구독자 등록이 안 되고, 기존 연결도 끊어진다.

!!! question "Q2"
    ROS2에서 DDS 구현체를 Fast DDS에서 CycloneDDS로 바꾸려면 어떻게 하는가?

??? success "정답"
    `RMW_IMPLEMENTATION` 환경변수를 변경한다.
    ```bash
    export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
    ```
    rclcpp/rclpy 코드는 수정하지 않아도 된다.

!!! question "Q3"
    DDS가 "데이터 중심(Data-Centric)"이라는 것은 무슨 의미인가?

??? success "정답"
    노드(발행자/구독자)의 정체성이 아닌 **Topic(데이터 타입과 이름)**을 기준으로 통신이 연결된다. 누가 보내는지가 아니라 무엇을 보내는지가 중심이다.

---

## 다음 세션 예고

**세션 2: DDS 핵심 모델 — DCPS와 발견(Discovery)**

- `DomainParticipant`, `Publisher`, `DataWriter` 계층 구조
- SPDP(참여자 발견) + SEDP(엔드포인트 발견) 동작 원리
