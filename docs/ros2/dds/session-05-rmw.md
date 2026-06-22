# DDS 미들웨어 구현체 비교 (rmw 레이어)

!!! info "세션 정보"
    - **학습 시간**: 2시간 (학습 1h 45m + 복습 15m)
    - **핵심 목표**: rmw 추상화 계층 구조와 Fast DDS / CycloneDDS 차이 이해
    - **관련 표준**: ROS Middleware Interface (rmw)

---

## 한 줄 요약

> ROS2는 **rmw(ROS Middleware Interface)**라는 추상화 레이어를 통해 DDS 벤더(Fast DDS, CycloneDDS 등)를 코드 수정 없이 교체할 수 있게 설계됐고, RTPS가 표준 와이어 프로토콜이라서 서로 다른 구현체끼리도 통신이 가능하다.

---

## rmw 추상화 계층 구조

ROS2는 DDS 표준 자체를 직접 쓰지 않고, **rmw(ROS Middleware Interface)**라는 추상화 레이어를 한 겹 더 둔다.

```
rclcpp / rclpy
      │
      ▼
   rcl (C API)
      │
      ▼
┌──────────────────┐
│   rmw (인터페이스) │  ← 함수 시그니처만 정의, 구현은 각 벤더가
└──────────────────┘
      │
      ├──→ rmw_fastrtps_cpp     (Fast DDS)
      ├──→ rmw_cyclonedds_cpp   (CycloneDDS)
      ├──→ rmw_connextdds      (RTI Connext)
      └──→ rmw_zenoh_cpp       (Zenoh, 최근 추가)
```

### rmw가 정의하는 함수들

```c
rmw_create_node()
rmw_create_publisher()
rmw_publish()
rmw_create_subscription()
rmw_take()              // 메시지 수신
rmw_destroy_node()
```

각 DDS 벤더는 이 함수들을 자기 SDK에 맞게 구현한다. `rclcpp`는 이 함수들만 호출하므로 **DDS 벤더가 바뀌어도 애플리케이션 코드는 그대로**다.

### rmw가 존재하는 이유

```
rmw가 없다면:
  rclcpp 코드 안에 Fast DDS API가 직접 박혀있음
  → CycloneDDS로 바꾸려면 rclcpp 자체를 다시 작성해야 함

rmw가 있으면:
  rclcpp ──→ rmw_publish() (추상 함수 호출)
                   │
                   ├─ Fast DDS가 구현하면 → Fast DDS SDK 호출
                   └─ CycloneDDS가 구현하면 → CycloneDDS SDK 호출

  rclcpp는 "무엇을 호출할지"만 알고 "어떻게 구현됐는지"는 모름
  → 벤더 종속성 제거, 표준 변경/업그레이드에도 rclcpp 코드 불변
```

OMG가 DDS API를 표준화했어도 각 벤더(eProsima, Eclipse 등)의 실제 C++ API는 서로 다르다. rmw가 그 차이를 흡수한다.

---

## Fast DDS vs CycloneDDS

ROS2의 양대 기본 DDS 구현체를 비교한다.

| 항목 | Fast DDS | CycloneDDS |
|------|----------|------------|
| 개발사 | eProsima | Eclipse Foundation |
| ROS2 기본값 | Humble까지 기본값 | Iron부터 일부 배포판 기본값 |
| 멀티캐스트 기본 동작 | 활성화 | 활성화 (더 보수적 설정) |
| XML 설정 방식 | Fast DDS Profiles XML | CycloneDDS 자체 XML (RFC 형식) |
| 메모리 사용 | 상대적으로 높음 | 상대적으로 가벼움 |
| Discovery 속도 | 빠름 | 약간 보수적 (안정성 우선) |
| 라이선스 | Apache 2.0 | Eclipse Public License |
| 디버깅 도구 | Fast DDS Monitor (GUI) | 별도 도구 적음, 로그 기반 |

### 실무에서 체감되는 차이

```
Fast DDS
  + 기본 설정으로도 잘 동작 (Humble 시절 검증됨)
  + GUI 모니터링 도구 제공
  - 멀티 노드 환경에서 Discovery 트래픽이 상대적으로 많음

CycloneDDS
  + 대규모 노드 환경에서 더 안정적이라는 평가
  + 설정이 단순한 편
  - XML 설정 문법이 Fast DDS와 다름 (전환 시 재학습 필요)
```

> 정답은 없다. **프로젝트 요구사항(노드 수, 네트워크 환경, 디버깅 필요성)에 따라 선택**한다.

---

## Discovery 트래픽 심화

세션 2의 SPDP/SEDP가 실제로 네트워크에 발생시키는 패킷량 문제.

### Discovery 트래픽이 불어나는 이유

```
노드가 N개 있을 때, 모든 노드가 서로를 알아야 함 (Full Mesh)

노드 3개:  A ↔ B, A ↔ C, B ↔ C           → 3쌍
노드 10개: 10×9/2 = 45쌍
노드 20개: 20×19/2 = 190쌍

각 노드가 평균 5개 Topic(Pub+Sub) 보유 시:
노드 10개:  10 × 9 × 5 = 450개 EDP 메시지 (초기 발견 시)
노드 50개:  50 × 49 × 5 = 12,250개 EDP 메시지
```

노드 수가 늘수록 Discovery 트래픽은 거의 **N²에 비례**해서 폭증한다. 데이터 트래픽(센서값, cmd_vel 등)이 아니라 "서로를 알아가는 과정" 자체가 무겁다는 점이 핵심이다.

### "대규모"의 기준

| 노드 수 | 체감 |
|---------|------|
| ~10개 | Fast DDS, CycloneDDS 둘 다 차이 거의 없음 |
| 10~30개 | Fast DDS도 무난, 약간의 Discovery 지연 시작 |
| 30~50개 | CycloneDDS가 안정성에서 우위 보고되는 구간 |
| 50개 이상 | CycloneDDS 권장 또는 Discovery Server 같은 별도 구조 필요 |

> 여기서 "노드 수"는 "ROS2 노드 개수"이지 "로봇 대수"가 아니다. 로봇 1대도 Nav2 스택만 켜면 노드 10~20개를 쉽게 넘는다.

### 멀티 로봇 환경에서의 선택

```
로봇 1대당 평균 노드 수 × 로봇 대수 = 전체 도메인 내 노드 수

예: 로봇 1대(Nav2 + 센서 + 컨트롤러) ≈ 15개 노드
   로봇 5대 = 75개 노드 (같은 도메인일 경우)
```

**CycloneDDS냐 Fast DDS냐보다, 로봇마다 Domain ID를 분리하는 게 먼저** 고려해야 할 설계다.

```
방법 1: 로봇마다 다른 Domain ID
  → 각 도메인은 15개 노드 수준 → DDS 구현체 상관없이 가벼움
  → 단점: 로봇 간 직접 통신이 필요하면 별도 브릿지 필요

방법 2: 모든 로봇이 같은 Domain 공유
  → 75개 노드가 한 도메인에서 Discovery
  → CycloneDDS + Discovery Server 조합이 유리
```

> Discovery Server는 세션 8(멀티머신 네트워킹)에서 더 다룬다.

---

## RMW_IMPLEMENTATION 환경변수, 런타임 교체

### 설치된 rmw 구현체 확인

```bash
ros2 doctor --report | grep rmw
# 또는
ament_index_print_resources rmw_typesupport
```

### 구현체 전환

```bash
# 현재 사용 중인 rmw 확인
echo $RMW_IMPLEMENTATION

# Fast DDS로 전환
export RMW_IMPLEMENTATION=rmw_fastrtps_cpp

# CycloneDDS로 전환
export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
```

!!! tip "서로 다른 rmw 구현체끼리도 통신 가능"
    같은 도메인 안에서 Fast DDS 노드와 CycloneDDS 노드가 통신할 수 있다. RTPS가 표준 와이어 프로토콜이라서, API는 벤더마다 달라도 네트워크에 실제로 나가는 패킷 포맷은 동일하기 때문이다.

```
노드 A (Fast DDS) ←──── RTPS 표준 패킷 ────→ 노드 B (CycloneDDS)
        ✓ 정상 통신 가능 (단, QoS·Discovery 미세 차이로 드물게 호환성 이슈 발생 가능)
```

### 코드 레벨에서는 변경 불필요

```cpp
// 이 코드는 Fast DDS든 CycloneDDS든 동일하게 동작
auto node = rclcpp::Node::make_shared("my_node");
auto pub = node->create_publisher<std_msgs::msg::String>("topic", 10);
```

`rclcpp` API는 rmw 구현체를 모르고 호출하므로, **빌드도 다시 할 필요 없이 환경변수만 바꾸면 즉시 적용**된다.

```bash
colcon build  # 빌드는 한 번만

RMW_IMPLEMENTATION=rmw_fastrtps_cpp ros2 run my_pkg my_node
RMW_IMPLEMENTATION=rmw_cyclonedds_cpp ros2 run my_pkg my_node
```

### 패키지 설치

```bash
sudo apt install ros-${ROS_DISTRO}-rmw-cyclonedds-cpp
sudo apt install ros-${ROS_DISTRO}-rmw-fastrtps-cpp
```

---

## 호출 vs 구현 흐름

`rmw_publish()` 같은 함수는 누가 호출하고 누가 구현하는지 명확히 구분해야 한다.

```
rclcpp (C++ API)
    │  내부적으로
    ▼
rcl (C API, 언어 공통)        ← 여기서 rmw 함수를 "호출"
    │  rmw_publish() 호출
    ▼
rmw 인터페이스 (함수 시그니처만 정의, 본체 없음)
    │  실제 구현은
    ▼
rmw_fastrtps_cpp / rmw_cyclonedds_cpp  ← 여기서 함수 본문을 "구현"
    │
    ▼
Fast DDS / CycloneDDS SDK 호출
```

---

## 핵심 개념 정리

!!! tip "세션 5 핵심 3가지"
    1. **rmw = DDS 추상화 인터페이스** — `rcl`이 호출하고, 각 DDS 벤더 패키지(`rmw_fastrtps_cpp` 등)가 구현
    2. **RMW_IMPLEMENTATION 환경변수**로 재빌드 없이 DDS 구현체 전환
    3. **RTPS가 표준이라 서로 다른 구현체끼리도 통신 가능**, Discovery 트래픽은 노드 수 증가에 N²로 폭증하므로 대규모 환경에서는 CycloneDDS나 Domain 분리 고려

---

## 복습 (15분)

!!! question "Q1"
    rmw 레이어가 존재하는 이유는 무엇인가?

??? success "정답"
    DDS 구현체를 코드 수정 없이 교체 가능하게 만들기 위해서다. rclcpp가 rmw의 추상 함수만 호출하고, 실제 구현은 각 DDS 벤더 패키지가 담당하므로 벤더 종속성이 제거된다.

!!! question "Q2"
    Fast DDS로 빌드된 노드와 CycloneDDS로 빌드된 노드가 같은 도메인에서 통신할 수 있는가?

??? success "정답"
    가능하다. RTPS가 와이어 프로토콜 표준이라서, API(함수 호출 방식)는 벤더마다 달라도 네트워크에 실제로 나가는 패킷 포맷은 RTPS로 통일되어 있기 때문이다.

!!! question "Q3"
    DDS 구현체를 Fast DDS에서 CycloneDDS로 바꿀 때 재빌드가 필요한가?

??? success "정답"
    필요 없다. 애플리케이션 코드는 rmw 인터페이스만 호출하므로 컴파일 타임에 특정 벤더와 묶여있지 않다. `RMW_IMPLEMENTATION` 환경변수만 바꾸면 런타임에 다른 공유 라이브러리가 로드된다.

!!! question "Q4"
    `rmw_publish()`, `rmw_create_node()` 같은 함수는 누가 호출하고, 누가 실제 구현하는가?

??? success "정답"
    - **호출**: `rcl`(C API 공통 레이어)이 호출한다.
    - **구현**: 각 DDS 벤더의 rmw 패키지(`rmw_fastrtps_cpp`, `rmw_cyclonedds_cpp` 등)가 실제 함수 본문을 작성한다.

---

## 다음 세션 예고

**세션 6: 네트워크 분리 — Domain ID & Namespace**

- Domain ID로 논리적 네트워크 분리
- ROS_DOMAIN_ID 설정, 포트 번호 공식
- Namespace, remapping으로 토픽 충돌 방지
