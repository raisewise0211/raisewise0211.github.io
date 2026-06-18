# 세션 6: 네트워크 분리 — Domain ID & Namespace

!!! info "세션 정보"
    - **학습 시간**: 2시간 (학습 1h 45m + 복습 15m)
    - **핵심 목표**: Domain ID로 물리적 네트워크 분리, Namespace로 논리적 토픽 분리
    - **관련 표준**: OMG DDS Domain, ROS2 Namespace/Remapping

---

## 한 줄 요약

> **Domain ID**는 Discovery 패킷이 도달하는 범위 자체를 물리적으로 분리하고, **Namespace**는 같은 Domain 안에서 토픽 이름에 접두사를 붙여 논리적으로 충돌을 방지한다.

---

## Domain ID로 논리적 네트워크 분리

### Domain ID의 본질

```
Domain ID = "이 도메인 안에서만 서로 Discovery 한다"는 격벽

같은 물리 네트워크(같은 와이파이/스위치)라도
Domain ID가 다르면 SPDP 멀티캐스트 자체가 다른 포트로 가서
서로 존재를 모름 → 완전 격리
```

```
같은 와이파이 네트워크
┌─────────────────────────────────────┐
│  Domain 0: 로봇 A의 노드들           │
│  ─ 포트 7400 사용                    │
│                                       │
│  Domain 1: 로봇 B의 노드들           │
│  ─ 포트 7650 사용                    │
│                                       │
│  → 둘은 같은 와이파이에 있어도       │
│    서로 ros2 topic list에 안 보임    │
└─────────────────────────────────────┘
```

각 도메인 **내부**에서는 SPDP/SEDP Discovery가 정상적으로 일어난다. 서로 다른 도메인끼리는 멀티캐스트 패킷이 다른 포트로 가기 때문에 물리적으로 도달하지 않아 격리되는 것이다.

### 왜 분리가 필요한가?

- **테스트/개발 환경 분리**: 개발 PC와 실제 로봇이 같은 네트워크에 있어도 서로 간섭 안 하게
- **다중 로봇 독립 운용**: 각 로봇이 자기 노드만 보고 통신
- **CI/CD 환경**: 같은 머신에서 여러 테스트 인스턴스를 동시에 돌릴 때 충돌 방지

---

## ROS_DOMAIN_ID 설정, 포트 번호 공식

### 설정 방법

```bash
export ROS_DOMAIN_ID=42

# 영구 설정 (bashrc)
echo "export ROS_DOMAIN_ID=42" >> ~/.bashrc
```

기본값은 `0`. 설정 안 하면 모든 ROS2 시스템이 기본 Domain 0을 공유한다 (같은 네트워크에 있으면 의도치 않게 서로 발견됨 — 흔한 실수).

### 포트 번호 공식

DDS RTPS는 Domain ID마다 **4개의 포트**를 사용한다.

```
PB = 7400 (기본 포트 베이스)
DG = 250  (Domain Gap)
PG = 2    (Participant Gap, 한 머신에 여러 Participant 있을 때)

공식:
  SPDP 멀티캐스트 포트 = PB + DG × DomainID
  SPDP 유니캐스트 포트 = PB + DG × DomainID + 1
  SEDP 멀티캐스트 포트 = PB + DG × DomainID + 2   (보통 안 씀)
  SEDP 유니캐스트 포트 = PB + DG × DomainID + (PG × ParticipantID) + 11
```

| Domain ID | SPDP 멀티캐스트 | SPDP 유니캐스트 |
|-----------|----------------|----------------|
| 0 | 7400 | 7401 |
| 1 | 7650 | 7651 |
| 5 | 8650 | 8651 |
| 10 | 9900 | 9901 |
| 42 | 17900 | 17901 |

!!! warning "Domain ID 범위 주의"
    이론상 0~232까지 가능하지만, 실용적으로는 **0~101** 권장. 너무 큰 값은 포트 번호가 65535(TCP/UDP 포트 한계)를 넘어갈 수 있어 일부 OS/방화벽에서 문제 발생.

```
계산 예: DomainID = 232
  7400 + 250 × 232 = 65,400 (한계 근접, 위험)

DomainID = 101
  7400 + 250 × 101 = 32,650 (안전)
```

### 실전 활용: 로봇 식별자로 활용

```bash
# 로봇 1
export ROS_DOMAIN_ID=1

# 로봇 2
export ROS_DOMAIN_ID=2

# 시뮬레이션 환경
export ROS_DOMAIN_ID=99
```

---

## Namespace, remapping으로 토픽 충돌 방지

Domain ID가 "물리적/네트워크 레벨 격리"라면, **Namespace**는 "같은 도메인 안에서 논리적으로 이름을 구분"하는 방법이다.

### Namespace 없이 동일 로봇 2대를 같은 Domain에 띄우면?

```
로봇 A: /cmd_vel, /odom, /scan
로봇 B: /cmd_vel, /odom, /scan

→ 토픽 이름이 같아서 서로 명령이 섞여버림! (충돌)
```

### Namespace로 해결

```bash
ros2 run my_robot_pkg controller --ros-args -r __ns:=/robot_a
ros2 run my_robot_pkg controller --ros-args -r __ns:=/robot_b
```

```
로봇 A: /robot_a/cmd_vel, /robot_a/odom, /robot_a/scan
로봇 B: /robot_b/cmd_vel, /robot_b/odom, /robot_b/scan

→ 같은 Domain에 있어도 완전히 독립적으로 통신
```

### Launch 파일에서 Namespace 적용

```python
# launch 파일 예시
Node(
    package='my_robot_pkg',
    executable='controller',
    namespace='robot_a',
    name='controller_node'
)
```

### Remapping — 토픽 이름 직접 변경

Namespace는 "접두사"를 붙이는 방식이고, **Remapping**은 토픽 이름 자체를 임의로 바꾸는 더 유연한 방법이다.

```bash
# /cmd_vel 토픽을 /robot_a/drive_cmd 로 변경
ros2 run my_robot_pkg controller --ros-args -r cmd_vel:=/robot_a/drive_cmd
```

```
사용 사례:
  - 레거시 시스템과 연동 시 토픽 이름 맞추기
  - 같은 노드를 다른 역할로 재사용 (센서 토픽 이름만 바꿔서)
  - 시뮬레이션 ↔ 실제 로봇 전환 시 토픽 분기
```

### Domain ID vs Namespace 비교

| 항목 | Domain ID | Namespace |
|------|-----------|-----------|
| 격리 수준 | 네트워크/Discovery 레벨 (완전 분리) | 토픽 이름 레벨 (논리적 구분) |
| 같은 도메인 내 통신 | 불가능 (서로 안 보임) | 가능 (의도하면 통신 가능) |
| 사용 사례 | 완전히 독립된 시스템 (다른 팀, 다른 환경) | 같은 시스템 내 여러 로봇/모듈 구분 |
| 변경 방법 | 환경변수 `ROS_DOMAIN_ID` | `--ros-args -r __ns:=` |

---

## 핵심 개념 정리

!!! tip "세션 6 핵심 3가지"
    1. **Domain ID**: 네트워크 레벨에서 물리적으로 격리, `7400 + 250×DomainID` 공식으로 포트 계산
    2. **Namespace**: 같은 Domain 안에서 토픽 이름에 접두사를 붙여 논리적으로 분리
    3. **Remapping**: 토픽 이름을 임의로 변경하는 유연한 방법, Namespace보다 세밀한 제어 가능

---

## 복습 (15분)

!!! question "Q1"
    `ROS_DOMAIN_ID=10`일 때 SPDP 유니캐스트 포트는?

??? success "정답"
    `7400 + 250×10 + 1 = 9901`

!!! question "Q2"
    Domain ID 분리와 Namespace 분리의 가장 큰 차이는?

??? success "정답"
    **Domain ID**는 Discovery 패킷이 물리적으로 도달하는 범위 자체를 분리한다 (서로 다른 포트라서 패킷이 안 닿음). 각 도메인 내부에서는 Discovery가 정상적으로 일어나지만, 도메인 간에는 패킷 교환이 아예 없다.
    **Namespace**는 같은 Domain·같은 포트에서 Discovery 패킷이 전부 오가지만, 토픽 이름 자체가 달라서 논리적으로 충돌을 방지하는 방식이다.

!!! question "Q3"
    같은 로봇 모델 2대를 같은 Domain에서 충돌 없이 운용하려면 어떻게 해야 하는가?

??? success "정답"
    각 로봇에 서로 다른 Namespace(`/robot_a`, `/robot_b` 등)를 부여한다. `--ros-args -r __ns:=/robot_a` 같은 방식으로 모든 토픽에 접두사가 붙어 충돌 없이 공존할 수 있다.

!!! question "Q4"
    Domain ID를 232처럼 너무 크게 설정하면 안 되는 이유는?

??? success "정답"
    `7400 + 250×232 = 65,400`으로 UDP/TCP 포트 번호 한계(65535)에 근접해서, 일부 OS/방화벽 환경에서 포트 할당 문제가 발생할 수 있다. 실용적으로 0~101 범위를 권장한다.

---

## 다음 세션 예고

**세션 7: DDS 설정 파일 (XML Profile)**

- FASTRTPS_DEFAULT_PROFILES_FILE 환경변수, XML 구조
- 유니캐스트 전용 설정 (클라우드/VPN 환경)
- Initial Peers 설정
