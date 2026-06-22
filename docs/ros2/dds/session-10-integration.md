# 전체 통합 & 실전 시나리오

!!! info "세션 정보"
    - **학습 시간**: 2시간 (학습 1h 45m + 복습 15m)
    - **핵심 목표**: 9개 세션의 개념을 하나의 실전 설계 문제로 통합
    - **관련 표준**: -

---

## 한 줄 요약

> DDS 학습 전체는 결국 트레이드오프 설계다 — **Domain 분리 vs Namespace**, **Reliable vs Best-Effort**, **멀티캐스트 vs Initial Peers** 중 요구사항에 맞는 선택을 하고, 노드가 많아지면 **Discovery Server**로 N² Discovery 트래픽 문제를 N으로 줄인다.

---

## 전체 개념 지도 리뷰

```
┌──────────────────────────────────────────────────────┐
│                     ROS2 Application                  │
└──────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────┐
│              rclcpp / rclpy  (세션 1)                  │
└──────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────┐
│                    rcl (C API)                        │
└──────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────┐
│         rmw (Fast DDS / CycloneDDS 선택)  (세션 5)      │
└──────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────┐
│   DDS DCPS: Domain → Participant → Writer/Reader       │
│   (세션 2: DCPS, 세션 6: Domain ID & Namespace)          │
└──────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────┐
│   QoS 정책: Reliability, Durability, History... (세션4)│
└──────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────┐
│   Discovery: SPDP/SEDP (세션2) + XML/Initial Peers(세션7)│
└──────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────┐
│   RTPS: Message/Submessage, HEARTBEAT/ACKNACK (세션3)  │
└──────────────────────────────────────────────────────┘
                          │
┌──────────────────────────────────────────────────────┐
│   네트워크: 멀티머신, 방화벽, VPN (세션8)                  │
│   보안: SROS2 Authentication/Access Control (세션9)     │
└──────────────────────────────────────────────────────┘
                          │
                      UDP / IP
```

---

## 실전 시나리오: 자율주행 로봇 함대 네트워크 설계

### 시나리오

```
요구사항:
  - 물류창고에서 자율주행 로봇 10대 운용
  - 중앙 관제 PC 1대가 모든 로봇 모니터링
  - 로봇끼리는 서로 통신할 필요 없음 (충돌 회피는 각자 센서로)
  - 관제 PC는 클라우드에도 데이터를 올림 (원격 모니터링)
  - 일부 로봇은 동일 모델 (토픽 이름 동일)
```

### 설계 적용

#### 1. Domain ID 전략 (세션 6)

```
로봇 1~10: 각자 ROS_DOMAIN_ID = 1~10 (로봇끼리 격리)

→ "로봇끼리 통신 불필요"가 핵심이므로 Domain 분리가 가장 효율적
→ 불필요한 Discovery 트래픽 자체가 발생하지 않음 (세션 5의 N² 문제 회피)
```

#### 2. Namespace (세션 6)

```
같은 모델 로봇이라도 Domain이 다르면 Namespace 불필요
(Domain ID 자체가 격리해주므로)
```

#### 3. QoS 설계 (세션 4)

```
/scan, /odom (고빈도 센서) → BEST_EFFORT + KEEP_LAST(1)
/battery_status (저빈도, 중요) → RELIABLE + KEEP_LAST(5)
/map (관제 PC가 배포) → RELIABLE + TRANSIENT_LOCAL
```

#### 4. 멀티머신 네트워킹 (세션 8)

```
로봇 Wi-Fi ↔ 관제 PC: 같은 서브넷이면 멀티캐스트 자동 동작
관제 PC ↔ 클라우드: 다른 네트워크 → Initial Peers 필수 (세션 7)
```

#### 5. 보안 (세션 9)

```
로봇 ↔ 관제 PC 구간: SROS2 Authentication
  (창고 내부 로봇이 외부 위장 노드의 명령을 받지 않도록)
관제 PC ↔ 클라우드 구간: Access Control
  (클라우드는 모니터링 데이터만 구독 가능, 명령 발행 권한 없음)
```

### 설계 다이어그램

```
[로봇 1] Domain=1 ─┐
[로봇 2] Domain=2 ─┤
...                 ├─→ [관제 PC] (멀티 도메인 모니터링)
[로봇 10] Domain=10─┘         │
                               │ Initial Peers (다른 네트워크)
                               ▼
                          [클라우드 서버]
                          (Access Control: 구독만 가능)
```

---

## 성능 튜닝: 대역폭 제한 환경, 고빈도 센서 최적화

### 대역폭이 제한적인 환경 (예: LTE/5G 연결 로봇)

```
문제: 카메라 이미지(/camera/image_raw)를 RELIABLE로 보내면
      네트워크가 막혔을 때 재전송이 계속 쌓여서 지연 폭증

해결:
  1. Lifespan QoS 적용 (세션 4)
     → 500ms 지난 이미지 프레임은 버림

  2. History를 KEEP_LAST(1)로 제한
     → 큐에 쌓이지 않고 항상 최신 프레임만 유지

  3. Best-Effort로 전환
     → 재전송 오버헤드 자체를 제거
```

### 고빈도 센서 데이터 최적화 체크리스트

```
IMU (200Hz~1000Hz급)
  ✓ BEST_EFFORT
  ✓ KEEP_LAST(1)
  ✓ Deadline 설정으로 결손 감지만 하고 재전송은 안 함

라이다 (10~20Hz, 큰 페이로드)
  ✓ BEST_EFFORT
  ✓ 메시지 크기가 크면 UDP fragmentation 발생
    → MTU 설정 확인 (Fast DDS의 max_message_size 옵션)

명령/이벤트 (저빈도, 중요)
  ✓ RELIABLE
  ✓ KEEP_ALL 또는 충분히 큰 KEEP_LAST
  ✓ Deadline으로 "명령이 안 옴" 자체를 감지해 안전 정지
```

### Discovery 트래픽 최적화 (Discovery Server)

세션 5에서 다룬 N² 문제를 다시 떠올려보자.

```
기존 방식 (Peer-to-Peer Discovery)
  노드 A ←→ 노드 B
  노드 A ←→ 노드 C        모든 노드가 모든 노드와 직접 정보 교환
  노드 B ←→ 노드 C        → N² 에 비례해서 폭증 (노드 50개 = 12,250개 메시지)

Discovery Server 방식
  노드 A ──→ [Discovery Server] ←── 노드 B
  노드 C ──→ [Discovery Server] ←── 노드 D

  각 노드는 서버 1곳하고만 통신 (자기 정보 등록 + 남의 정보 조회)
  → 트래픽이 N² 이 아니라 N 에 비례
  → 멀티캐스트 자체가 필요 없어짐 (서버와는 유니캐스트로만 통신)
  → 클라우드/VPN 환경에서도 유리 (Initial Peers를 서버 주소 하나로 통일 가능)
```

```bash
# Discovery Server 실행 (Fast DDS 전용 기능)
ros2 run fastrtps Discovery_server --domain 1 --port 11811

# 클라이언트 노드에서
export ROS_DISCOVERY_SERVER=192.168.1.100:11811
```

추가로 불필요한 introspection 범위도 제한할 수 있다.

```bash
export ROS_AUTOMATIC_DISCOVERY_RANGE=LOCALHOST
```

---

## 최종 복습: 나만의 DDS 치트시트

!!! tip "DDS 핵심 한 장 요약"
    | 질문 | 답 |
    |------|-----|
    | 노드가 안 보일 때 | Domain ID, 멀티캐스트/AP Isolation 확인 |
    | 토픽 연결 안 될 때 | `ros2 topic info --verbose`로 QoS 비교 |
    | 다른 네트워크 통신 | Initial Peers + 멀티캐스트 비활성화 |
    | 고빈도 센서 | BEST_EFFORT + KEEP_LAST(1) |
    | 중요 명령/맵 | RELIABLE (+TRANSIENT_LOCAL) |
    | 로봇 함대 격리 | Domain ID 분리 또는 Namespace |
    | 보안 필요 시 | SROS2: Authentication + Access Control |
    | 노드 많을 때 무거움 | CycloneDDS 또는 Discovery Server |

---

## 핵심 개념 정리

!!! tip "세션 10 핵심 3가지"
    1. **전체 스택**: 애플리케이션 → rmw → DCPS/QoS → Discovery → RTPS → 네트워크/보안
    2. **설계는 트레이드오프**: Domain 분리 vs Namespace, Reliable vs Best-Effort — "정답"이 아니라 요구사항에 맞는 선택
    3. **튜닝 핵심**: 고빈도=Best-Effort+KEEP_LAST(1), 저빈도 중요=Reliable, 노드 많으면 Discovery Server

---

## 복습 (15분)

!!! question "Q1"
    서로 통신할 필요 없는 로봇 10대를 격리하는 가장 효율적인 방법은? (Discovery 트래픽 관점에서)

??? success "정답"
    Domain ID를 로봇마다 분리한다. Namespace는 같은 Domain 안에서 Discovery 트래픽 자체는 그대로 발생시키지만, Domain 분리는 애초에 서로 다른 도메인 간 Discovery 패킷이 오가지 않아 가장 효율적이다.

!!! question "Q2"
    대역폭이 제한된 LTE 환경에서 카메라 영상을 보낼 때, Reliable QoS를 쓰면 안 되는 이유는?

??? success "정답"
    Reliable은 놓친 패킷을 재전송하려고 HEARTBEAT/ACKNACK을 주고받는데, 그 사이 더 최신 프레임이 쌓이면서 지연이 커진다. 영상은 최신 프레임이 중요하므로 과거 프레임 재전송에 자원을 쓰는 게 오히려 손해다. Best-Effort + Lifespan + KEEP_LAST(1) 조합이 적합하다.

!!! question "Q3"
    Discovery Server가 해결하는 문제는 무엇인가?

??? success "정답"
    세션 5의 N² Discovery 트래픽 문제를 해결한다. 기존 Peer-to-Peer 방식은 모든 노드가 서로 직접 정보를 교환해 노드 수의 제곱에 비례해 트래픽이 폭증하지만, Discovery Server는 중앙 서버 한 곳에만 등록·조회하는 구조로 바꿔 트래픽을 노드 수에 비례하게(N) 줄인다. 멀티캐스트도 불필요해져 클라우드/VPN 환경에도 유리하다.

!!! question "Q4"
    지금까지 배운 10개 세션 중 가장 헷갈렸던 개념을 다시 정리해보자.

??? success "전체 복습 가이드"
    - 세션 1: ROS1 vs ROS2 레이어 구조
    - 세션 2: DCPS 엔티티 계층, SPDP/SEDP Discovery
    - 세션 3: RTPS Message/Submessage, HEARTBEAT/ACKNACK
    - 세션 4: QoS 정책(Reliability, Durability, History, Deadline, Liveliness, Lifespan)
    - 세션 5: rmw 추상화, Fast DDS vs CycloneDDS, Discovery 트래픽 N² 문제
    - 세션 6: Domain ID 포트 공식, Namespace/Remapping
    - 세션 7: XML Profile, 멀티캐스트 비활성화, Initial Peers
    - 세션 8: 멀티머신 네트워킹, 방화벽, Wireshark 디버깅
    - 세션 9: DDS Security 5플러그인, SROS2 Keystore/Enclave/Permissions
    - 세션 10: 전체 통합 설계, Discovery Server

---

## 학습 완료 — 다음 단계

20시간 DDS 핵심 이론 학습이 모두 끝났다. 다음 단계는 **각 세션 개념을 실제 예제 코드로 작성하고 직접 실행**해보며 결과를 정리하는 실습 단계다.
