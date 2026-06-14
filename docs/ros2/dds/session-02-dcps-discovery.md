# 세션 2: DDS 핵심 모델 — DCPS & Discovery

!!! info "세션 정보"
    - **학습 시간**: 2시간 (학습 1h 45m + 복습 15m)
    - **핵심 목표**: DDS 엔티티 계층 구조와 rosmaster 없는 자동 발견 원리 이해
    - **관련 표준**: OMG DDS-DCPS 1.4, RTPS 2.3 SPDP/SEDP

---

## 한 줄 요약

> DDS는 **DCPS 엔티티 계층**(Domain → DomainParticipant → DataWriter/DataReader → Topic)으로 통신을 구성하고, **SPDP(참여자 발견) → SEDP(엔드포인트 발견)** 2단계 Discovery로 중앙 서버 없이 노드끼리 자동으로 연결된다.

---

## DCPS 엔티티 계층 구조

DDS의 통신 모델인 **DCPS(Data-Centric Publish-Subscribe)**는 "누구와 통신하느냐"가 아니라 **"어떤 데이터(Topic)를 통해 통신하느냐"**를 중심으로 설계됐다.

```
Domain (통신 공간)
└── DomainParticipant (노드 수준)
    ├── Publisher
    │   └── DataWriter  ──→  Topic
    └── Subscriber
        └── DataReader  ←──  Topic
```

| 엔티티 | 역할 | ROS2 대응 |
|--------|------|-----------|
| **Domain** | 논리적 통신 공간 (번호로 구분) | `ROS_DOMAIN_ID` |
| **DomainParticipant** | 도메인에 참여하는 주체 | ROS2 노드 1개 |
| **Publisher** | DataWriter들의 컨테이너 | `rclcpp::Publisher` 내부 |
| **DataWriter** | 실제 데이터를 Topic에 쓰는 주체 | `publisher->publish()` |
| **Subscriber** | DataReader들의 컨테이너 | `rclcpp::Subscription` 내부 |
| **DataReader** | Topic에서 데이터를 읽는 주체 | 콜백 함수로 전달됨 |
| **Topic** | 데이터 타입 + 이름의 결합 | `/cmd_vel`, `/scan` |

!!! tip "핵심"
    - **DomainParticipant = ROS2 노드** (1:1 대응)
    - Publisher/Subscriber는 컨테이너, 실제 통신은 **DataWriter ↔ DataReader**
    - Topic은 **이름 + 데이터 타입** 두 가지가 모두 일치해야 연결됨

---

## Topic, DataType, Domain ID

DataWriter와 DataReader가 연결되려면 **3가지가 모두 일치**해야 한다.

```
DataWriter                    DataReader
──────────                    ──────────
Topic 이름: /scan      ══════  Topic 이름: /scan
데이터 타입: LaserScan  ══════  데이터 타입: LaserScan
Domain ID: 0           ══════  Domain ID: 0
                    ↓
              QoS 호환성까지 맞으면 연결 완료
```

### Domain ID

같은 네트워크에 여러 ROS2 시스템이 있을 때 **논리적으로 분리**하는 수단이다.

- 기본값: `0`
- 실용 범위: `0 ~ 101` (멀티캐스트 포트 충돌 방지)
- 설정: `export ROS_DOMAIN_ID=42`

```
Domain 0: 로봇 A의 노드들  ─────  서로 통신 가능
Domain 1: 로봇 B의 노드들  ─────  서로 통신 가능
         ↕ 도메인이 달라서 완전 격리
```

---

## Discovery 프로토콜

ROS2에서 `ros2 node list`를 실행하면 노드들이 자동으로 보인다. rosmaster 없이 이게 가능한 이유가 **DDS Discovery**다.

### Discovery 전체 타임라인

```
t=0.0s  노드 A 시작 → PDP 멀티캐스트 전송 (SPDP)
t=0.0s  노드 B 시작 → PDP 멀티캐스트 전송 (SPDP)

t=0.1s  노드 A가 B의 PDP 수신 → EDP 메시지 유니캐스트 전송 (SEDP)
t=0.1s  노드 B가 A의 PDP 수신 → EDP 메시지 유니캐스트 전송 (SEDP)

t=0.2s  양쪽에서 매칭 판정 완료 → P2P 데이터 채널 수립
        → 이제부터 publish() 하면 subscribe 콜백 호출됨

t=3s    PDP 재전송 (Liveliness 유지)
t=6s    PDP 재전송 ...
```

---

### 1단계: SPDP — 참여자 발견

**"나(노드/참여자)가 여기 있다"** 를 알리는 단계.

노드가 시작되면 즉시 **PDP 메시지**를 멀티캐스트로 전송한다.

```
노드 A 시작
    │
    ▼
PDP 메시지 생성 (내 정보 패킷)
    │
    ▼
멀티캐스트 239.255.0.1:7400 으로 전송  ──→  같은 도메인의 모든 노드 수신
    │
    ▼
수신한 노드들도 자신의 PDP 메시지를 A에게 유니캐스트로 응답
    │
    ▼
양방향으로 서로의 존재 인식 완료
```

#### PDP 메시지에 담기는 정보

```
PDP 메시지 내용
├── GUID (전역 고유 식별자)
│     └── GuidPrefix(12바이트) + EntityId(4바이트)
│           IP + PID + 랜덤값으로 생성 → 전 세계 유일
├── DomainID
├── 유니캐스트 수신 주소 (IP:Port)
├── 멀티캐스트 수신 주소
├── Liveliness 정보
└── 프로토콜 버전, 벤더 ID (Fast DDS / CycloneDDS 등)
```

#### PDP 주기적 재전송

PDP 메시지는 한 번만 보내지 않고 **주기적으로 재전송**한다.

- 나중에 참여한 노드도 발견할 수 있어야 함
- UDP 기반이라 패킷 손실 가능 → 재전송으로 보완
- 기본 주기: Fast DDS 기준 **3초마다**

#### SPDP 포트 계산

| 항목 | 공식 | Domain ID=0 | Domain ID=5 |
|------|------|-------------|-------------|
| SPDP 멀티캐스트 포트 | `7400 + 250 × DomainID` | 7400 | **8650** |
| SEDP 유니캐스트 포트 | `7401 + 250 × DomainID` | 7401 | 8651 |

---

### 2단계: SEDP — 엔드포인트 발견

**"나는 이런 Topic을 발행/구독한다"** 를 교환하는 단계.

SPDP로 서로의 존재를 안 다음, EDP 메시지를 유니캐스트로 교환한다.

```
노드 A → 노드 B:  "나는 /scan 토픽 DataWriter 보유
                   타입: sensor_msgs/LaserScan
                   QoS: RELIABLE, TRANSIENT_LOCAL"

노드 B → 노드 A:  "나는 /scan 토픽 DataReader 보유
                   타입: sensor_msgs/LaserScan
                   QoS: RELIABLE, VOLATILE"
```

#### EDP 메시지에 담기는 정보

```
EDP 메시지 내용
├── Endpoint GUID
├── Topic 이름     ex) "rt/scan"  (ROS2는 "rt/" prefix 자동 추가)
├── 데이터 타입    ex) "sensor_msgs::msg::dds_::LaserScan_"
├── Endpoint 종류  DataWriter or DataReader
└── QoS 정책 목록 (Reliability, Durability, History, Deadline ...)
```

#### 매칭 판정

EDP 메시지 교환 후 양쪽이 독립적으로 판정한다.

```
매칭 조건 체크리스트
┌─────────────────────────────┬────────┐
│ Topic 이름 일치             │ 필수   │
│ 데이터 타입 일치            │ 필수   │
│ QoS 호환성 (요청 ≤ 제공)   │ 필수   │
└─────────────────────────────┴────────┘

모두 통과 → P2P 직접 연결 수립
하나라도 실패 → 연결 안 됨
```

---

### QoS 호환성 판정 규칙

SEDP에서 가장 많이 문제가 생기는 부분이다.

!!! warning "원칙"
    **구독자가 요청한 QoS ≤ 발행자가 제공하는 QoS**
    발행자가 구독자의 요구를 충족할 수 있어야 연결된다.

```
예시 1 — 호환 O
  DataWriter:  RELIABILITY = RELIABLE     (더 강한 보장)
  DataReader:  RELIABILITY = BEST_EFFORT  (더 약한 요구)
  → 연결됨

예시 2 — 호환 X (흔한 실수!)
  DataWriter:  RELIABILITY = BEST_EFFORT
  DataReader:  RELIABILITY = RELIABLE
  → 연결 안 됨 → ros2 topic echo 해도 아무것도 안 나옴
```

!!! danger "ROS2 토픽이 연결 안 될 때"
    90%는 QoS 불일치 문제다. `ros2 topic info <topic> --verbose` 로 양쪽 QoS를 확인하라.

---

### GUID — DDS 전역 고유 식별자

Discovery 전체에서 노드와 엔드포인트를 식별하는 핵심 키다.

```
GUID 구조 (16바이트)
┌──────────────────────────────┬────────────┐
│  GuidPrefix (12바이트)       │ EntityId   │
│  IP + PID + 랜덤             │ (4바이트)  │
└──────────────────────────────┴────────────┘

EntityId 예약값
  00 00 01 C1  → DomainParticipant 자신
  00 00 02 C2  → SEDP 내장 DataWriter
  00 00 03 C7  → SEDP 내장 DataReader
```

`ros2 daemon`이 내부적으로 이 GUID를 추적해서 `ros2 node list`, `ros2 topic list` 등을 제공한다.

---

### 멀티캐스트 없는 환경의 Discovery

클라우드, 다른 서브넷, VPN에서는 멀티캐스트가 차단되어 SPDP가 동작하지 않는다.

**해결책: Initial Peers** — 상대방 IP를 미리 지정해 유니캐스트로 PDP를 전송한다.

```xml
<!-- Fast DDS XML 설정 -->
<builtin>
  <initialPeersList>
    <locator>
      <udpv4>
        <address>192.168.1.100</address>
      </udpv4>
    </locator>
  </initialPeersList>
</builtin>
```

> 세션 7(XML 설정), 세션 8(멀티머신 네트워킹)에서 실습과 함께 다룬다.

---

## 핵심 개념 정리

!!! tip "세션 2 핵심 3가지"
    1. **DCPS 계층**: Domain → DomainParticipant → DataWriter/DataReader → Topic
    2. **Topic 매칭 3조건**: 이름 + 타입 + Domain ID 모두 일치 필요
    3. **Discovery 2단계**: SPDP(참여자 발견) → SEDP(엔드포인트 발견), rosmaster 불필요

---

## 복습 (15분)

!!! question "Q1"
    ROS2 노드 1개는 DDS에서 어떤 엔티티에 대응하는가?

??? success "정답"
    **DomainParticipant** — ROS2 노드 1개가 DomainParticipant 1개에 대응한다.

!!! question "Q2"
    DataWriter와 DataReader가 연결되기 위한 3가지 조건은?

??? success "정답"
    1. **Topic 이름** 일치
    2. **데이터 타입** 일치
    3. **Domain ID** 일치
    (+ QoS 호환성)

!!! question "Q3"
    SPDP와 SEDP의 역할 차이는?

??? success "정답"
    - **SPDP**: "나(참여자/노드)가 여기 있다" — 참여자 존재 알림
    - **SEDP**: "나는 이런 Topic을 발행/구독한다" — 엔드포인트 정보 교환
    
    순서: SPDP로 상대 노드를 발견한 **다음에** SEDP로 Topic 정보를 교환하고, 매칭되면 P2P 연결 수립.

!!! question "Q4"
    `ROS_DOMAIN_ID=5`일 때 SPDP 멀티캐스트 포트는?

??? success "정답"
    `7400 + 250 × 5 = **8650**`

---

## 다음 세션 예고

**세션 3: 전송 계층 — RTPS 프로토콜**

- RTPS 패킷 구조: Message, Submessage
- Reliable 전송 메커니즘: HEARTBEAT / ACKNACK
- 멀티캐스트 vs 유니캐스트, Locator 개념
