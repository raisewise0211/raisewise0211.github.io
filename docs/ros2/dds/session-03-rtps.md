# 세션 3: 전송 계층 — RTPS 프로토콜

!!! info "세션 정보"
    - **학습 시간**: 2시간 (학습 1h 45m + 복습 15m)
    - **핵심 목표**: DDS가 네트워크에서 실제로 패킷을 주고받는 방식 이해
    - **관련 표준**: OMG DDSI-RTPS 2.3

---

## 한 줄 요약

> **RTPS(Real-Time Publish-Subscribe)**는 DDS의 유선 프로토콜로, UDP 위에서 Message/Submessage 구조로 패킷을 구성하고, **HEARTBEAT/ACKNACK**으로 Reliable 전송을 구현하며, **Locator**로 유니캐스트/멀티캐스트를 선택한다.

---

## RTPS 구조: Message & Submessage

DDS가 "무엇을 보낼까"를 정의한다면, RTPS는 "어떻게 패킷으로 포장해서 보낼까"를 정의한다.

### RTPS 패킷 구조

```
UDP 패킷
└── RTPS Message
    ├── Header (고정 20바이트)
    │     ├── 매직넘버: "RTPS"
    │     ├── 프로토콜 버전: 2.3
    │     ├── 벤더 ID: (Fast DDS = 0x010F, CycloneDDS = 0x0110)
    │     └── GuidPrefix: 송신자 식별자 (12바이트)
    │
    └── Submessage [] (1개 이상, 가변)
          ├── SubHeader (종류 + 플래그 + 길이)
          └── SubBody   (내용)
```

### 주요 Submessage 종류

| Submessage | 방향 | 역할 |
|------------|------|------|
| `DATA` | Writer → Reader | 실제 데이터 페이로드 전송 |
| `HEARTBEAT` | Writer → Reader | "나 여기까지 보냈어, 받았니?" |
| `ACKNACK` | Reader → Writer | "N번까지 받았어, M번 다시 줘" |
| `GAP` | Writer → Reader | "이 번호들은 건너뜀" |
| `INFO_TS` | - | 타임스탬프 정보 |
| `INFO_DST` | - | 목적지 GUID 변경 |

---

## Reliable vs Best-Effort 전송

QoS의 `Reliability` 설정이 RTPS에서 실제로 어떻게 동작하는지 살펴본다.

### Best-Effort 전송

```
DataWriter                          DataReader
    │                                   │
    │── DATA(seqNum=1) ───────────────→ │ ✓ 수신
    │── DATA(seqNum=2) ──────────────╳  │ ✗ 패킷 손실
    │── DATA(seqNum=3) ───────────────→ │ ✓ 수신
    │                                   │
    └─ 끝. 재전송 없음, 확인 없음
```

- UDP 특성 그대로 사용
- 오버헤드 최소 → **고빈도 센서 데이터에 적합** (라이다, IMU, 카메라)

### Reliable 전송

```
DataWriter                          DataReader
    │                                   │
    │── DATA(seqNum=1) ───────────────→ │ ✓
    │── DATA(seqNum=2) ──────────────╳  │ ✗ 손실
    │── DATA(seqNum=3) ───────────────→ │ ✓
    │                                   │
    │← HEARTBEAT(1~3까지 보냄) ─────── │ (Reader가 2번 없음을 인지)
    │                                   │
    │← ACKNACK(2번 없어, 재전송 요청) ─ │
    │                                   │
    │── DATA(seqNum=2) 재전송 ────────→ │ ✓
    │                                   │
    │← ACKNACK(모두 받음) ────────────  │
```

| 메커니즘 | 역할 |
|----------|------|
| **HEARTBEAT** | Writer가 주기적으로 "나는 1번~N번까지 보냈다"고 알림 |
| **ACKNACK** | Reader가 "M번까지 받았고, 이 번호들이 없다"고 응답, Writer가 재전송 |

### 언제 무엇을 쓰나?

| 데이터 | QoS | 이유 |
|--------|-----|------|
| 라이다, IMU, 카메라 | Best-Effort | 100Hz 이상 고빈도, 1~2프레임 손실 무방 |
| 명령 (cmd_vel, action goal) | Reliable | 반드시 전달돼야 함 |
| 맵 데이터, 파라미터 | Reliable + TRANSIENT_LOCAL | 늦게 참여한 노드도 받아야 함 |
| TF 변환 | Best-Effort | 매우 고빈도, 최신값이 중요 |

---

## 멀티캐스트 vs 유니캐스트, Locator

### Locator 개념

RTPS에서 "어디로 보낼지"를 표현하는 주소 구조가 **Locator**다.

```
Locator
├── Kind (주소 종류)
│     ├── LOCATOR_KIND_UDPv4 (1)
│     ├── LOCATOR_KIND_UDPv6 (2)
│     └── LOCATOR_KIND_INVALID (-1)
├── Port (포트 번호)
└── Address (IP 주소)
```

각 DomainParticipant는 **최소 2개의 Locator**를 갖는다: 유니캐스트(나에게만), 멀티캐스트(그룹으로).

### 멀티캐스트 vs 유니캐스트 사용 시점

```
Discovery 단계 (SPDP)
    └── 멀티캐스트 239.255.0.1:7400
          → "모두에게 내 존재 알림"

Discovery 단계 (SEDP)
    └── 유니캐스트 (상대방 IP:Port)
          → "알게 된 상대에게만 Topic 정보 교환"

데이터 전송 단계
    ├── 구독자 1명  → 유니캐스트 (1:1 직접 전송)
    └── 구독자 여럿 → 멀티캐스트 (1:N 동시 전송, 대역폭 절약)
          단, 같은 서브넷 + 멀티캐스트 지원 네트워크 필요
```

### 실제 통신 흐름

```
[노드 A] DataWriter ─── RTPS DATA Submessage (UDP) ───→ [노드 B] DataReader
                                                          [노드 C] DataReader
                                                          [노드 D] DataReader

멀티캐스트 주소 하나로 B, C, D 동시 수신
→ 네트워크 트래픽 1/3로 감소
```

### Fast DDS 기본 동작

- **구독자 1명**: 자동으로 유니캐스트 사용
- **구독자 여럿**: 자동으로 멀티캐스트 전환 (설정에 따라 다름)
- 클라우드/VPN 환경: 멀티캐스트 불가 → 유니캐스트 강제 설정 필요 (세션 7)

---

## 핵심 개념 정리

!!! tip "세션 3 핵심 3가지"
    1. **RTPS = DDS의 실제 패킷 포맷** — Message > Submessage 구조
    2. **Reliable = HEARTBEAT/ACKNACK 핑퐁** — 손실 감지 후 재전송
    3. **Locator** — RTPS가 유니캐스트/멀티캐스트를 상황에 따라 자동 선택

---

## 복습 (15분)

!!! question "Q1"
    RTPS 패킷에서 Header에 담기는 정보 3가지는?

??? success "정답"
    매직넘버("RTPS"), 프로토콜 버전, 벤더 ID, GuidPrefix 중 3가지(보통 매직넘버/버전/GuidPrefix를 핵심으로 꼽는다).

!!! question "Q2"
    Reliable 전송에서 HEARTBEAT와 ACKNACK의 역할 차이는?

??? success "정답"
    - **HEARTBEAT**: Writer → Reader. "나는 N번까지 보냈다"는 진행 상황 알림
    - **ACKNACK**: Reader → Writer. "이 번호들을 못 받았다"는 재전송 요청

!!! question "Q3"
    라이다 데이터(100Hz)에 Reliable QoS를 쓰면 어떤 문제가 생기는가?

??? success "정답"
    재전송 메커니즘(HEARTBEAT/ACKNACK) 오버헤드로 인해 네트워크 트래픽과 지연이 증가한다. 어차피 다음 프레임이 곧 오므로 과거 프레임 재전송은 의미가 적어 Best-Effort가 더 적합하다.

!!! question "Q4"
    구독자가 3개 노드일 때, 멀티캐스트를 쓰면 유니캐스트 대비 네트워크 트래픽이 어떻게 달라지는가?

??? success "정답"
    유니캐스트는 3개 노드 각각에 데이터를 복제 전송해야 해서 트래픽이 3배가 되지만, 멀티캐스트는 하나의 멀티캐스트 주소로 한 번만 전송하면 3개 노드가 동시 수신 가능해 트래픽이 1/3 수준으로 줄어든다.

---

## 다음 세션 예고

**세션 4: QoS 정책 마스터**

- Reliability, Durability, History 핵심 정책
- Deadline, Liveliness, Lifespan 실시간 정책
- QoS 호환성 매트릭스
