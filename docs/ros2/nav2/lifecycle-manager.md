# Lifecycle Manager

!!! info "패키지 정보"
    - **패키지**: `nav2_lifecycle_manager`
    - **역할**: Nav2 스택의 모든 라이프사이클 노드를 중앙에서 관리하는 감독자(supervisor)
    - **노드 타입**: `rclcpp::Node` (라이프사이클 노드가 아닌 일반 노드)
    - **기준 버전**: Nav2 Jazzy / Rolling
    - **핵심 의존성**: `bondcpp`, `nav2_util::LifecycleServiceClient`, `diagnostic_updater`

---

## 한 줄 요약

> Nav2 스택의 라이프사이클 노드들을 **순서대로, 일괄로, 에러 처리와 함께** 전환시키고, Bond 하트비트로 노드 생존을 감시해 크래시 시 자동 재기동하는 감독자 패키지.

---

## 패키지 개요

| 항목 | 내용 |
|------|------|
| 역할 | Nav2 라이프사이클 노드 그룹의 상태 전환 오케스트레이션 |
| 노드 타입 | `rclcpp::Node` (일반 노드, 라이프사이클 노드 아님) |
| 핵심 의존성 | `bondcpp` (헬스체크), `nav2_util::LifecycleServiceClient`, `diagnostic_updater` |
| 관리 대상 | `node_names_` 파라미터로 지정된 임의의 라이프사이클 노드 목록 |
| 확장 방식 | `node_names_` 파라미터 변경으로 관리 노드 추가/제거 |

---

## 전체 파일 구조

```
nav2_lifecycle_manager/
├── src/
│   ├── main.cpp                          # 독립 실행 진입점
│   ├── lifecycle_manager.cpp             # 핵심 감독자 구현
│   └── lifecycle_manager_client.cpp      # 외부에서 매니저를 호출하는 클라이언트
├── include/nav2_lifecycle_manager/
│   ├── lifecycle_manager.hpp             # LifecycleManager 클래스 선언
│   └── lifecycle_manager_client.hpp      # LifecycleManagerClient 클래스 선언
└── test/
    ├── test_lifecycle_manager.cpp        # 상태 전환 통합 테스트
    └── test_bond.cpp                     # Bond 연결 테스트
```

---

## 핵심 개념: ROS2 라이프사이클 노드란?

ROS2의 라이프사이클 노드(`rclcpp_lifecycle::LifecycleNode`)는 노드의 수명주기를 명시적인 **상태 머신**으로 모델링한다. 일반 노드가 생성 즉시 동작을 시작하는 것과 달리, 라이프사이클 노드는 외부 감독자가 `configure → activate` 순서로 명시적으로 깨워야 동작한다. 덕분에 시스템 전체를 **결정적 순서로** 기동·정지할 수 있다.

아래 5가지 **주요 상태**를 가진다:

```
[UNCONFIGURED]
      │ configure()
      ▼
 [INACTIVE]
      │ activate()          │ cleanup()
      ▼                     ▼
  [ACTIVE]          [UNCONFIGURED]
      │ deactivate()
      ▼
 [INACTIVE]
      │ shutdown()
      ▼
 [FINALIZED]
```

!!! quote "출처 — ROS 2 *Managed nodes* 설계 문서"
    ROS 2 공식 설계 문서는 4개의 주요 상태(**Unconfigured / Inactive / Active / Finalized**)와, 그 사이의 6개 **전이(transition) 상태**(Configuring, CleaningUp, Activating, Deactivating, ShuttingDown, ErrorProcessing)를 정의한다. 이 상태 머신은 외부 감독 프로세스가 노드의 초기화·실행·종료를 관리할 수 있도록 설계되었다.
    — [design.ros2.org/articles/node_lifecycle.html](https://design.ros2.org/articles/node_lifecycle.html)

**LifecycleManager의 역할**: 여러 노드에 대해 이 상태 전환을 **순서대로**, **일괄로**, **에러 처리와 함께** 수행한다. Nav2가 이런 중앙 집중식 라이프사이클 관리와 복구 메커니즘을 채택한 배경은 Marathon 2 논문에 정리되어 있다([Macenski et al., IROS 2020](https://arxiv.org/abs/2003.00368)).

---

## 각 파일 역할 및 함수/클래스 설명

### `lifecycle_manager.cpp` — 중앙 감독자

**클래스**: `nav2_lifecycle_manager::LifecycleManager`
**상속**: `rclcpp::Node` (라이프사이클 노드가 아닌 일반 노드)
**역할**: `node_names_`에 등록된 라이프사이클 노드들의 상태를 외부 서비스 요청에 따라 전환. Bond 기반 헬스체크로 노드 생존 여부 감시.

#### 상태 관련

**열거형 `NodeState`**:

| 값 | 의미 |
|----|------|
| `UNCONFIGURED` | 관리 노드들이 configure 전 초기 상태 |
| `INACTIVE` | configure 완료, activate 전 |
| `ACTIVE` | 정상 동작 중 |
| `FINALIZED` | shutdown 완료 |
| `UNKNOWN` | 상태 전환 실패 등 오류 상황 |

#### 생성자 / 소멸자

| 메서드 | 설명 |
|--------|------|
| `LifecycleManager(options)` | 파라미터 선언, 전환 맵 초기화, `init_timer_` 등록으로 비동기 초기화 시작 |
| `~LifecycleManager()` | `service_thread_` 해제 |

#### 초기화 메서드

| 메서드 | 설명 |
|--------|------|
| `createLifecycleServiceClients()` | `node_names_` 각각에 대한 `LifecycleServiceClient` 생성 → `node_map_` 에 저장 |
| `createLifecycleServiceServers()` | `manage_nodes`, `is_active` 서비스 서버 생성 |
| `createLifecyclePublishers()` | `managed_nodes_activated` 래치 퍼블리셔 생성 및 초기 상태 퍼블리시 |
| `destroyLifecycleServiceClients()` | `node_map_` 해제 |
| `destroyLifecyclePublishers()` | 퍼블리셔 비활성화 및 해제 |

#### 핵심 서비스 콜백

| 메서드 | 설명 |
|--------|------|
| `managerCallback(request, response)` | `manage_nodes` 서비스 진입점. `request->command`에 따라 `startup()`/`configure()`/`cleanup()`/`reset()`/`shutdown()`/`pause()`/`resume()` 분기 |
| `isActiveCallback(request, response)` | `is_active` 서비스 진입점. `managed_nodes_state_ == ACTIVE` 여부 반환 |

#### 상태 전환 메서드

| 메서드 | 수행 동작 | 성공 시 상태 |
|--------|-----------|-------------|
| `startup()` | configure → activate (순서대로) | `ACTIVE` + Bond 타이머 시작 |
| `configure()` | configure만 수행 | `INACTIVE` |
| `cleanup()` | cleanup 수행 | `UNCONFIGURED` |
| `reset(hard_reset)` | deactivate → cleanup (역순). `hard_reset=true`면 실패해도 계속 진행 | `UNCONFIGURED` |
| `pause()` | deactivate 수행 | `INACTIVE` + Bond 타이머 해제 |
| `resume()` | activate 수행 | `ACTIVE` + Bond 타이머 재시작 |
| `shutdown()` | deactivate → cleanup → shutdown (역순) + 클라이언트/퍼블리셔 해제 | `FINALIZED` |

**중요한 순서 정책**:

- `configure`, `activate`: `node_names_` **정순** (의존성 순서대로 활성화)
- `deactivate`, `cleanup`, `shutdown`: `node_names_` **역순** (의존성 역순으로 정리)

#### 저수준 상태 전환 메서드

| 메서드 | 설명 |
|--------|------|
| `changeStateForNode(node_name, transition)` | 단일 노드에 `change_state()` 호출 후 목표 상태 확인. `ACTIVATE`면 Bond 연결 생성, `DEACTIVATE`면 Bond 해제 |
| `changeStateForAllNodes(transition, hard_change)` | 전체 노드에 `changeStateForNode()` 순서대로 적용. 실패 시 `hard_change=false`면 즉시 중단 |
| `shutdownAllNodes()` | deactivate → cleanup → shutdown 3단계 순차 실행 |

#### Bond 헬스체크 메서드

| 메서드 | 설명 |
|--------|------|
| `createBondConnection(node_name)` | 노드와 Bond 연결 생성. `bond_timeout_/2` 내 연결 미확립 시 false 반환 |
| `createBondTimer()` | 200ms 주기로 `checkBondConnections()` 호출하는 타이머 생성 |
| `destroyBondTimer()` | Bond 타이머 취소 및 해제 |
| `checkBondConnections()` | `bond_map_`의 각 Bond 상태 확인. 하나라도 끊기면 `reset(true)` (하드 리셋) 후 재기동 타이머 시작 |
| `checkBondRespawnConnection()` | 1초 주기로 크래시된 노드가 재기동됐는지 확인. 전체 복구 시 `startup()` 재호출. `bond_respawn_max_duration_` 초과 시 포기 |

#### 진단/상태 메서드

| 메서드 | 설명 |
|--------|------|
| `setState(state)` | `managed_nodes_state_` 갱신 후 `publishIsActiveState()` 호출 |
| `isActive()` | `managed_nodes_state_ == ACTIVE` 반환 |
| `publishIsActiveState()` | `managed_nodes_activated` 토픽에 Bool 퍼블리시 |
| `CreateDiagnostic(stat)` | 상태별 진단 레벨(OK/WARN/ERROR) 설정 |
| `onRclPreshutdown()` | RCL 컨텍스트 종료 직전 콜백. Bond/서비스 스레드/맵 정리 |
| `registerRclPreshutdownCallback()` | `onRclPreshutdown`을 RCL 컨텍스트의 pre-shutdown 콜백으로 등록 |
| `message(msg)` | 콘솔에 파란색 굵은 글씨로 상태 메시지 출력 |

#### 주요 멤버 변수

| 변수 | 타입 | 설명 |
|------|------|------|
| `node_map_` | `map<string, shared_ptr<LifecycleServiceClient>>` | 노드 이름 → 서비스 클라이언트 |
| `bond_map_` | `map<string, shared_ptr<bond::Bond>>` | 노드 이름 → Bond 연결 |
| `node_names_` | `vector<string>` | 관리할 노드 이름 목록 (순서 중요) |
| `managed_nodes_state_` | `NodeState` | 현재 전체 시스템 상태 |
| `transition_state_map_` | `unordered_map<uint8_t, uint8_t>` | 전환 ID → 목표 상태 ID 매핑 |
| `bond_timeout_` | `chrono::milliseconds` | Bond 하트비트 타임아웃 |
| `service_timeout_` | `chrono::milliseconds` | 서비스 응답 타임아웃 |
| `bond_respawn_max_duration_` | `rclcpp::Duration` | 재기동 대기 최대 시간 |
| `autostart_` | `bool` | 노드 시작 시 자동으로 startup() 호출 여부 |
| `attempt_respawn_reconnection_` | `bool` | Bond 실패 후 재기동 재연결 시도 여부 |
| `callback_group_` | `CallbackGroup` | 서비스/타이머용 전용 콜백 그룹 (MutuallyExclusive) |
| `service_thread_` | `unique_ptr<NodeThread>` | 콜백 그룹 전용 실행 스레드 |

---

### `lifecycle_manager_client.cpp` — 클라이언트 헬퍼

**클래스**: `nav2_lifecycle_manager::LifecycleManagerClient`
**역할**: 외부 노드(예: 네비게이션 앱, 테스트 코드)가 LifecycleManager의 서비스를 쉽게 호출할 수 있도록 래핑한 헬퍼 클래스.

**열거형 `SystemStatus`**:

| 값 | 의미 |
|----|------|
| `ACTIVE` | 관리 노드들이 활성 상태 |
| `INACTIVE` | 비활성 상태 |
| `TIMEOUT` | 서비스 응답 타임아웃 |

#### 퍼블릭 메서드

| 메서드 | 내부 동작 |
|--------|-----------|
| `startup(timeout)` | `callService(STARTUP, timeout)` |
| `shutdown(timeout)` | `callService(SHUTDOWN, timeout)` |
| `pause(timeout)` | `callService(PAUSE, timeout)` |
| `resume(timeout)` | `callService(RESUME, timeout)` |
| `reset(timeout)` | `callService(RESET, timeout)` |
| `configure(timeout)` | `callService(CONFIGURE, timeout)` |
| `cleanup(timeout)` | `callService(CLEANUP, timeout)` |
| `is_active(timeout)` | `is_active` 서비스 호출 → `SystemStatus` 반환 |

#### 프로텍티드 메서드

| 메서드 | 설명 |
|--------|------|
| `callService(command, timeout)` | `ManageLifecycleNodes` 서비스에 command를 담아 동기 호출. 타임아웃 시 `false` |

#### 생성자 (템플릿)

```cpp
template<typename NodeT>
LifecycleManagerClient(const std::string & name, NodeT parent_node)
```

- `name + "/manage_nodes"` 서비스 클라이언트 생성
- `name + "/is_active"` 서비스 클라이언트 생성
- 내부 executor를 spin하는 방식으로 동기 호출 지원

---

### `main.cpp` — 진입점

독립 실행 바이너리용 진입점. 컴포넌트(`RCLCPP_COMPONENTS_REGISTER_NODE`)로도 등록되어 있어 컴포넌트 컨테이너 방식으로도 실행 가능.

```cpp
int main(int argc, char ** argv) {
  rclcpp::init(argc, argv);
  auto node = std::make_shared<LifecycleManager>();
  rclcpp::spin(node);
  rclcpp::shutdown();
}
```

---

## 파일 간 연계 관계 도식도

```
┌──────────────────────────────────────────────────────────────────┐
│                    외부 사용자 / 다른 노드                        │
│  (네비게이션 앱, 테스트 코드, CLI: ros2 service call)            │
└──────────────────────────────┬───────────────────────────────────┘
                               │ ROS2 서비스 호출
           ┌───────────────────┴────────────────────┐
           │ /lifecycle_manager/manage_nodes         │ /lifecycle_manager/is_active
           ▼                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│               LifecycleManagerClient                             │
│  (lifecycle_manager_client.hpp/.cpp)                            │
│                                                                  │
│  startup() / shutdown() / pause() / resume()                    │
│  reset() / configure() / cleanup() / is_active()                │
│      └─ callService() → ManageLifecycleNodes 서비스 호출        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼ ROS2 서비스 응답
┌─────────────────────────────────────────────────────────────────┐
│                  LifecycleManager (rclcpp::Node)                 │
│              (lifecycle_manager.hpp/.cpp)                        │
│                                                                  │
│  managerCallback()                                               │
│    ├── startup()    → configure (정순) → activate (정순)        │
│    ├── configure()  → configure (정순)                           │
│    ├── cleanup()    → cleanup (역순)                             │
│    ├── reset()      → deactivate (역순) → cleanup (역순)        │
│    ├── pause()      → deactivate (역순)                          │
│    ├── resume()     → activate (정순)                            │
│    └── shutdown()   → deactivate → cleanup → shutdown (역순)    │
│                                                                  │
│  [Bond 감시]                                                      │
│  bond_timer_ (200ms)                                             │
│    └── checkBondConnections()                                    │
│          └── bond.isBroken() → reset(hard=true)                 │
│                              → bond_respawn_timer_ (1s)          │
│                                  └── checkBondRespawnConnection()│
│                                        └── startup() (복구 시) │
└────────────────┬──────────────────────────────────┬─────────────┘
                 │ LifecycleServiceClient             │ bond::Bond
                 │ (nav2_util)                        │ (bondcpp)
                 ▼                                    ▼
┌───────────────────────────┐     ┌───────────────────────────────┐
│  관리 대상 라이프사이클    │     │  Bond 하트비트 토픽           │
│  노드들                   │     │  /bond/{node_name}            │
│                           │     │                               │
│  /controller_server       │◄────│  ← 주기적 heartbeat 수신      │
│  /planner_server          │     │  bond_timeout_ 내 미수신 시   │
│  /bt_navigator            │     │  isBroken() = true            │
│  /map_server  ...         │     └───────────────────────────────┘
│                           │
│  lifecycle 서비스:        │
│  /{node}/change_state     │
│  /{node}/get_state        │
└───────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    퍼블리시 / 진단                               │
│                                                                  │
│  /lifecycle_manager/managed_nodes_activated  (std_msgs/Bool)    │
│    → ACTIVE 상태 변경 시마다 래치 퍼블리시                       │
│                                                                  │
│  /diagnostics  (diagnostic_updater)                             │
│    → OK / WARN / ERROR 상태 퍼블리시                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 핵심 메커니즘: Bond 헬스체크

Bond(`bondcpp`)는 두 ROS2 노드 간 **양방향 하트비트**를 교환하는 라이브러리다.
LifecycleManager는 이를 이용해 관리 노드가 **크래시/응답 없음** 상태가 되면 즉각 감지하고 전체 시스템을 안전하게 내린다.

!!! quote "출처 — bond_core (bondcpp)"
    "A bond allows two processes, A and B, to know when the other has terminated, either cleanly or by crashing." 두 프로세스가 주기적으로 하트비트를 주고받다가, 한쪽이 타임아웃 동안 응답하지 않으면 *broken* 으로 판정한다.
    — [github.com/ros/bond_core](https://github.com/ros/bond_core)

### Bond 생명주기

```
[activate 직후]
  createBondConnection(node_name)
    ├── bond::Bond 객체 생성 ("bond" 토픽, node_name ID)
    ├── setHeartbeatTimeout(bond_timeout_s)
    ├── setHeartbeatPeriod(bond_heartbeat_period_)  ← 기본 0.25초
    ├── start()
    └── waitUntilFormed(timeout/2)  ← 연결 확립 대기

[200ms 주기: checkBondConnections()]
  for each node_name in node_names_:
    if bond_map_[node_name]->isBroken():
      ← bond_timeout_ (기본 4초) 이상 하트비트 미수신

      reset(hard_reset=true)  ← 모든 노드 강제 내림
      bond_map_.clear()

      if attempt_respawn_reconnection_:
        bond_respawn_timer_ 시작 (1초 주기)

[1초 주기: checkBondRespawnConnection()]
  for each node_name:
    node_map_[node_name]->get_state()  ← 서비스 응답 여부로 생존 확인

  if 전체 응답:
    startup()  ← 자동 재기동
  elif 타임아웃 초과 (bond_respawn_max_duration_, 기본 10초):
    포기 (타이머 해제)
```

### Bond 비활성화

`bond_timeout = 0.0`으로 설정하면 Bond 연결 자체를 생성하지 않는다 (`createBondConnection`에서 조기 return).

---

## 상태 전환 흐름

### 정상 시작 시나리오 (`autostart: true`)

```
노드 시작
  └── init_timer_ (0초 후 실행)
        ├── createLifecyclePublishers()
        ├── createLifecycleServiceClients()
        ├── createLifecycleServiceServers()
        └── startup() 자동 호출
              ├── changeStateForAllNodes(CONFIGURE)  ← 정순
              │     node1 → node2 → node3 → ...
              ├── changeStateForAllNodes(ACTIVATE)   ← 정순
              │     node1 → node2 → node3 → ...
              │     각 노드 activate 후 createBondConnection()
              ├── setState(ACTIVE)
              └── createBondTimer()  ← 200ms 헬스체크 시작
```

### 노드 크래시 감지 시나리오

```
node2 프로세스 종료
  └── bond_map_["node2"]->isBroken() == true  (4초 후)
        ├── reset(hard=true)
        │     deactivate: node3 → node2(실패, 계속) → node1  ← 역순
        │     cleanup:   node3 → node2(실패, 계속) → node1  ← 역순
        │     setState(UNCONFIGURED)
        ├── bond_map_.clear()
        └── bond_respawn_timer_ 시작 (1초 주기)
              └── 모든 노드 get_state() 응답 시:
                    startup()  ← 전체 재기동
```

---

## 주요 파라미터 정리

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `node_names` | `[]` | 관리할 라이프사이클 노드 이름 목록 (순서 = 기동 순서) |
| `autostart` | `false` | true이면 노드 시작 시 자동으로 startup() 호출 |
| `bond_timeout` | `4.0` | Bond 하트비트 타임아웃 (초). 0이면 Bond 비활성화 |
| `bond_heartbeat_period` | `0.25` | Bond 하트비트 전송 주기 (초) |
| `service_timeout` | `5.0` | 라이프사이클 서비스 응답 타임아웃 (초) |
| `bond_respawn_max_duration` | `10.0` | Bond 실패 후 재기동 대기 최대 시간 (초) |
| `attempt_respawn_reconnection` | `true` | Bond 실패 후 자동 재기동 시도 여부 |

!!! note "파라미터 레퍼런스"
    각 파라미터의 공식 정의와 최신 기본값은 Nav2 문서의 Lifecycle Manager 설정 페이지에서 확인할 수 있다.
    — [docs.nav2.org/configuration/packages/configuring-lifecycle.html](https://docs.nav2.org/configuration/packages/configuring-lifecycle.html)

### 예시 파라미터 파일

```yaml
lifecycle_manager:
  ros__parameters:
    autostart: true
    node_names:
      - map_server
      - amcl
      - controller_server
      - planner_server
      - bt_navigator
    bond_timeout: 4.0
    bond_heartbeat_period: 0.25
    service_timeout: 5.0
    bond_respawn_max_duration: 10.0
    attempt_respawn_reconnection: true
```

---

## ROS2 인터페이스 (토픽/서비스)

### 제공하는 서비스 (Server)

| 서비스 이름 | 타입 | 설명 |
|-------------|------|------|
| `/{node_name}/manage_nodes` | `nav2_msgs/srv/ManageLifecycleNodes` | STARTUP/SHUTDOWN/CONFIGURE/CLEANUP/RESET/PAUSE/RESUME 명령 수신 |
| `/{node_name}/is_active` | `std_srvs/srv/Trigger` | 현재 ACTIVE 상태 여부 조회 |

### 퍼블리시하는 토픽

| 토픽 이름 | 타입 | 설명 |
|-----------|------|------|
| `/{node_name}/managed_nodes_activated` | `std_msgs/msg/Bool` | ACTIVE 상태 변경 시 래치 퍼블리시 |
| `/diagnostics` | `diagnostic_msgs/msg/DiagnosticArray` | 시스템 상태 진단 정보 |

### CLI 사용 예시

```bash
# 수동으로 startup 명령
ros2 service call /lifecycle_manager/manage_nodes \
  nav2_msgs/srv/ManageLifecycleNodes \
  "{command: 0}"  # 0=STARTUP, 1=PAUSE, 2=RESUME, 3=RESET, 4=SHUTDOWN, 5=CONFIGURE, 6=CLEANUP

# 활성 상태 확인
ros2 service call /lifecycle_manager/is_active std_srvs/srv/Trigger

# 상태 토픽 모니터링
ros2 topic echo /lifecycle_manager/managed_nodes_activated
```

---

## 커스텀 활용 방향

### 방향 1: 다중 LifecycleManager 운용

Nav2는 기능 도메인별로 독립적인 LifecycleManager를 여러 개 실행한다:

```yaml
# navigation_manager
lifecycle_manager_navigation:
  node_names: [controller_server, planner_server, bt_navigator]

# localization_manager
lifecycle_manager_localization:
  node_names: [map_server, amcl]
```

**효과**: 로컬리제이션은 유지하면서 내비게이션만 재시작 가능.

### 방향 2: 커스텀 관리 로직을 위한 LifecycleManagerClient 활용

자신의 노드에서 `LifecycleManagerClient`를 사용해 조건부 관리:

```cpp
#include "nav2_lifecycle_manager/lifecycle_manager_client.hpp"

class MyRobotManager : public rclcpp::Node {
  MyRobotManager() : Node("my_robot_manager") {
    nav_client_ = std::make_unique<LifecycleManagerClient>(
      "lifecycle_manager_navigation", shared_from_this());
  }

  void onObstacleDetected() {
    // 장애물 감지 시 일시 정지
    nav_client_->pause();
  }

  void onObstacleCleared() {
    nav_client_->resume();
  }

  std::unique_ptr<LifecycleManagerClient> nav_client_;
};
```

### 방향 3: Bond 없는 경량 운용

임베디드 환경이나 리소스 제한 환경:

```yaml
lifecycle_manager:
  ros__parameters:
    bond_timeout: 0.0  # Bond 완전 비활성화
    attempt_respawn_reconnection: false
```

### 방향 4: LifecycleManager 상속 확장

커스텀 감독 로직 추가:

```cpp
class MyLifecycleManager : public nav2_lifecycle_manager::LifecycleManager {
protected:
  // startup 전 사전 조건 검사
  bool startup() override {
    if (!checkPreconditions()) {
      RCLCPP_ERROR(get_logger(), "Preconditions not met");
      return false;
    }
    return LifecycleManager::startup();
  }

  // 커스텀 헬스체크 추가 (Bond + 추가 로직)
  void checkBondConnections() override {
    LifecycleManager::checkBondConnections();
    checkCustomHealthMetrics();  // 추가 헬스체크
  }
};
```

---

## 참고 자료 (References)

이 문서의 이론적 배경(ROS 2 라이프사이클 노드, Bond 헬스체크, Nav2 라이프사이클 관리)은 아래 1차 자료에 근거한다.

1. **ROS 2 *Managed nodes* 설계 문서** — 라이프사이클 노드의 상태 머신(주요 4상태 + 전이 6상태)과 외부 감독 모델의 원전.
   [https://design.ros2.org/articles/node_lifecycle.html](https://design.ros2.org/articles/node_lifecycle.html)
2. **bond_core (bondcpp)** — 두 프로세스가 하트비트로 상대의 종료/크래시를 감지하는 라이브러리. LifecycleManager의 헬스체크 기반.
   [https://github.com/ros/bond_core](https://github.com/ros/bond_core)
3. **Nav2 Lifecycle Manager 설정 문서** — `node_names`, `autostart`, `bond_timeout` 등 파라미터의 공식 레퍼런스.
   [https://docs.nav2.org/configuration/packages/configuring-lifecycle.html](https://docs.nav2.org/configuration/packages/configuring-lifecycle.html)
4. **S. Macenski, F. Martín, R. White, J. Ginés Clavero, "The Marathon 2: A Navigation System," IROS 2020 (arXiv:2003.00368)** — Nav2의 라이프사이클 관리·복구 시스템 설계 배경을 다룬 논문.
   [https://arxiv.org/abs/2003.00368](https://arxiv.org/abs/2003.00368)

!!! note "출처"
    본문 구조와 함수/파라미터 설명은 `nav2_lifecycle_manager` 패키지 (Nav2 Jazzy/Rolling 기준) 소스코드 분석을 기반으로 하며, 이론 부분은 위 참고 자료를 출처로 한다.
