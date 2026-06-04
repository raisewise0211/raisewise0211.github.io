# Mission Client (VDA5050 Client)

!!! info "패키지 정보"
    - **패키지**: `isaac_ros_vda5050_client`
    - **역할**: VDA5050 주문/즉시명령을 받아 Nav2 주행 + 액션 핸들러로 실행하는 Mission Client 본체
    - **노드 타입**: `rclcpp::Node` (컴포넌트로도 등록)
    - **핵심 클래스**: `isaac_ros::mission_client::Vda5050ClientNode`
    - **핵심 의존성**: `nav2_msgs`, `vda5050_msgs`, `pluginlib`, `tf2_ros`, `vda5050_action_handler`

---

## 한 줄 요약

> 3개 상태(`IDLE`/`RUNNING`/`PAUSED`) 상태기계를 두 타이머로 굴리며, **노드별 액션의 blocking 규칙을 판정**해 Nav2 주행과 플러그인 액션을 조율하고, 매 변화를 `AGVState`로 발행하는 미션 실행 엔진.

---

## 패키지 개요

| 항목 | 내용 |
|------|------|
| 역할 | VDA5050 주문 실행 오케스트레이션 (주행 + 액션) |
| 노드 타입 | `rclcpp::Node`, `RCLCPP_COMPONENTS_REGISTER_NODE`로 컴포넌트 등록 |
| 실행 진입점 | `vda5050_client_main.cpp` (SingleThreadedExecutor) |
| 확장 방식 | `config.yaml`의 `action_handlers` + pluginlib 플러그인 |
| 주행 백엔드 | Nav2 `navigate_through_poses` 액션 |
| 상태 보고 | `agv_state`(1Hz), `factsheet`, `order_id`(1Hz) 토픽 |

---

## 전체 파일 구조

```
isaac_ros_vda5050_client/
├── src/
│   ├── vda5050_client_main.cpp        # 독립 실행 진입점 (main)
│   ├── vda5050_client_node.cpp        # ★ 모든 로직 (상태기계/주행/액션/취소/일시정지)
│   └── example_action_handler.cpp     # 베이스 구현 예제 플러그인
├── include/isaac_ros_vda5050_client/
│   ├── vda5050_client_node.hpp        # Vda5050ClientNode 선언 + 템플릿 콜백
│   └── example_action_handler.hpp
├── config/
│   └── config.yaml                    # 기본(예제) 핸들러 설정
├── plugin.xml                         # example 핸들러 pluginlib 등록
└── test/
    ├── test_nav2_client.py            # 통합 테스트
    ├── test_nodes/nav2_simple_server.py   # Nav2 액션 시뮬 서버
    └── test_orders/*.json             # 주문 시나리오 (blocking/parallel/failure 등)
```

---

## 각 파일 역할

### `vda5050_client_main.cpp` — 진입점

```cpp
int main(int argc, char * argv[]) {
  rclcpp::init(argc, argv);
  rclcpp::executors::SingleThreadedExecutor exec;
  auto client_node = std::make_shared<Vda5050ClientNode>(rclcpp::NodeOptions());
  exec.add_node(client_node);
  exec.spin();
  rclcpp::shutdown();
}
```

단일 스레드 executor로 노드를 spin. 컴포넌트 등록도 되어 있어 컨테이너 방식 로딩도 가능.

### `vda5050_client_node.hpp` — 선언부

- 멤버/콜백 선언과 함께 **헤더에 정의된 템플릿 콜백 2종**이 핵심:
    - `ActionResponseCallback<ActionType>(goal, action)` — goal 수락/거부 → `RUNNING`/`FAILED`
    - `ActionResultCallback<ResultType>(action, result, success, description)` — 결과 코드(SUCCEEDED/ABORTED/CANCELED)를 VDA5050 액션 상태(`FINISHED`/`FAILED`)로 매핑
- 플러그인이 include해서 쓰는 **공개 API**: `UpdateActionState`, `UpdateActionStateById`, `CreateError`, `AddError`

### `vda5050_client_node.cpp` — 본체

**클래스**: `Vda5050ClientNode` · **상속**: `rclcpp::Node`

#### 생성자가 하는 일

| 단계 | 동작 |
|------|------|
| 파라미터 선언 | `update_feedback_period`, `odom_topic`, `battery_state_topic`, `robot_type`, `status_check_service`, `config_file`, `base_frame` |
| 구독 생성 | `client_commands`(Order), `instant_actions_commands`(InstantActions), `battery_state`, `odom`, `order_valid_error`, `info` |
| 발행 생성 | `agv_state`(AGVState), `factsheet`(Factsheet), `order_id`(String) |
| 액션 클라이언트 | `navigate_through_poses` (Nav2) |
| Factsheet 초기화 | `robot_type`에 따라 `speed_max` 설정 (MANIPULATOR/CONVEYOR는 0 = 비주행형) |
| **플러그인 로딩** | `config_file`의 `action_handlers` 순회 → `pluginlib`으로 인스턴스화 → `action_handler_map_[action_type] = plugin` |
| 타이머 3개 | State(1Hz), ExecuteOrder(5Hz), OrderId(1Hz) |
| TF | `map → base_frame` 조회용 buffer/listener |

#### 주요 콜백 / 메서드

| 메서드 | 설명 |
|--------|------|
| `OrderCallback(Order)` | `CanAcceptOrder()` 통과 시 `current_order_` 저장, `InitAGVState()` 호출 |
| `InitAGVState()` | 새 주문에 맞춰 `node_states`/`action_states` 구성, 직전 주문 잔여 상태 정리, `client_state_ = RUNNING` |
| `InstantActionsCallback(InstantActions)` | 즉시명령 분기: `cancelOrder`/`startTeleop`/`stopTeleop`/`factsheetRequest`/`startPause`/`stopPause` 또는 일반 핸들러 |
| `ExecuteOrderCallback()` | **메인 루프(5Hz).** 취소/일시정지 처리 → 위치 갱신 → 액션 블로킹 판정 → 주행/완료 전환 |
| `NavigateThroughPoses()` | 다음 정지점까지 pose들을 묶어 Nav2 goal 전송 |
| `ExecuteAction(action)` | `action_handler_map_`에서 핸들러 찾아 `Execute()`. `pause_order` 특수 처리 |
| `CancelOrder()` / `PauseOrder()` / `ResumeOrder()` | 멱등적 핸드셰이크로 액션/주행 중단·재개 |
| `UpdateActionState(ById)` | `action_states` 갱신 + `PublishRobotState()` (플러그인이 호출) |
| `BatteryStateCallback` / `OdometryCallback` / `InfoCallback` | 센서/정보를 AGVState 필드에 매핑 |
| `PublishRobotState()` / `PublishRobotFactsheet()` | 타임스탬프 찍어 발행 |

#### 주요 멤버 변수

| 변수 | 타입 | 설명 |
|------|------|------|
| `client_state_` | `enum {IDLE, RUNNING, PAUSED}` | 전체 미션 상태 |
| `current_order_` | `Order::ConstSharedPtr` | 실행 중인 주문 |
| `agv_state_` | `AGVState::SharedPtr` | 클라우드로 보고할 누적 상태 |
| `action_handler_map_` | `unordered_map<string, handler>` | action_type → 플러그인 |
| `action_handler_loader_` | `pluginlib::ClassLoader` | 핸들러 동적 로더 |
| `current_node_` / `next_stop_` | `size_t` | 현재 노드 / 이번 주행의 목표 노드 인덱스 |
| `reached_waypoint_` | `bool` | 현재 노드 도달 여부 (액션 실행 조건) |
| `pause_order_` | `bool` | 텔레옵/일시정지로 주행 멈춤 |
| `cancel_action_` / `pause_action_` | `Action::SharedPtr` | 펜딩 즉시명령 |
| `state_mutex_` | `std::mutex` | `agv_state_` 보호 |

---

## 핵심 알고리즘

### 1. 상태기계 — 두 타이머의 협력

3개 상태(`IDLE`/`RUNNING`/`PAUSED`)를 두 타이머가 나눠 담당한다.

| 타이머 | 주기 | 역할 |
|--------|------|------|
| **State 타이머** | 1Hz (`update_feedback_period`) | 무조건 현재 `AGVState` 발행 → 클라우드는 항상 최신 상태 수신 |
| **Execute 타이머** | 5Hz (0.2s, `kExecuteOrderPeriod`) | 실제 진행 엔진. 매 틱마다 아래 알고리즘 수행 |
| OrderId 타이머 | 1Hz | `order_id` 발행 → json_info_generator가 버퍼 리셋 판단에 사용 |

`ExecuteOrderCallback()` 매 틱 처리:

```
1. cancel_action_ 있으면 → CancelOrder()
2. pause_action_  있으면 → PauseOrder()
3. 주행형 로봇이면 TF map→base_link 로 agv_position 갱신
   (TF 실패 시 이번 틱 skip, 120초 throttle 경고)
4. client_state_ == RUNNING 이고:
   - errors[0] 이 FATAL 이면 → 러닝 액션 없을 때 IDLE 전환 후 종료
   - reached_waypoint_ == true 이면 → [2] 액션 블로킹 판정 실행
```

### 2. 액션 블로킹 처리 (VDA5050 핵심 규칙)

현재 노드의 액션들을 순회하며 `blocking_type`으로 **주행 가부**와 **실행 가부**를 결정한다.

| blocking_type | 의미 | 동작 |
|---------------|------|------|
| **HARD** (빈 값은 HARD 취급) | 그 시점 유일 허용 | 다른 러닝 액션 없을 때만 실행, 끝날 때까지 **주행·다른 액션 모두 대기**(`return`) |
| **SOFT** | 다른 액션 OK, 주행 불가 | 실행하되 `stop_driving = true` 로 주행만 정지 |
| **NONE** | 주행·다른 액션 모두 허용 | 즉시 병렬 실행, 주행 계속 |

```
for action in current_order_.nodes[current_node_].actions:
    status = GetActionState(action.action_id)
    if status in {FINISHED, FAILED}: continue
    elif status in {RUNNING, INITIALIZING}:
        has_running_action = true
        if HARD:  return            # 끝날 때까지 전부 대기
        if SOFT:  stop_driving = true
    elif status == WAITING:
        if HARD:
            if not has_running_action: ExecuteAction(action)
            return                   # 하드 끝날 때까지 대기
        else:                        # SOFT/NONE
            if SOFT: stop_driving = true
            ExecuteAction(action)    # 즉시 실행
            has_running_action = true

if stop_driving: return              # SOFT/HARD 진행 중 → 주행 정지

next_stop_++                         # 이 노드의 SOFT/HARD 액션 모두 완료
if next_stop_ >= nodes.size():       # 마지막 노드 → 주문 완료
    PublishRobotState(); client_state_ = IDLE
else:
    reached_waypoint_ = false; NavigateThroughPoses()   # 다음 구간 주행
```

### 3. NavigateThroughPoses — 구간 묶기

현재 노드 다음부터 pose를 누적하다가, 아래 중 하나를 만나면 그 지점을 `next_stop_`으로 끊어 **하나의 Nav2 goal**로 보낸다:

- **(a)** 액션이 있는 노드 (그 노드에서 멈춰 액션 실행해야 함)
- **(b)** 마지막 노드
- **(c)** `allowed_deviation_x_y == 0` (정밀 정지 요구)

```cpp
for (i = current_node_+1; i < nodes.size(); i++) {
    poses.push_back(node[i] 위치를 PoseStamped로 변환);  // theta → quaternion
    if (node[i].actions.size() > 0 || i == nodes.size()-1
        || node[i].node_position.allowed_deviation_x_y == 0) {
        next_stop_ = i; break;
    }
}
```

- 시작 시(`current_node_ == 0`) `status_check_service`로 Nav2가 `ACTIVE`인지 확인 후 진행
- 콜백:
    - `NavGoalResponseCallback` — 거부 시 FATAL 에러 + IDLE
    - `NavFeedbackCallback` — `number_of_poses_remaining`으로 `current_node_` 역산, 통과 노드의 `node_states` 제거
    - `NavResultCallback` — SUCCEEDED 시 `reached_waypoint_ = true`, ABORTED/CANCELED는 에러 처리

### 4. 액션 핸들러 디스패치 (확장 메커니즘)

```
config.yaml(action_handlers) ─생성자─▶ pluginlib.createSharedInstance(plugin)
   → plugin.Initialize(this, config[name])
   → 각 action_type 문자열 → action_handler_map_[type] = plugin

런타임: ExecuteAction(action)
   → action_handler_map_[action.action_type].Execute(action)
   → 없으면 UpdateActionState(FAILED, "Action handler not found")
```

새 작업 추가 = **새 플러그인 + config 한 줄**. 클라이언트 본체는 무수정. 자세한 플러그인 규약은 [Action Handlers](action-handlers.md) 참고.

### 5. 취소 / 일시정지 핸드셰이크

`CancelOrder()`·`PauseOrder()`는 **여러 틱에 걸쳐 멱등적으로** 동작한다:

```
WAITING 액션      → 즉시 FAILED(취소) / 그대로(일시정지)
RUNNING/INIT 액션 → handler->Cancel()/Pause() 호출
                    (canceled_action_ids_ / paused_action_ids 로 중복 호출 방지)
진행 중 nav goal  → async_cancel_goal()

모든 액션 정리 && nav_goal_handle_ == nullptr 이 되면:
   cancelOrder/startPause 액션을 FINISHED 로 마감
   client_state_ = IDLE / PAUSED 전환
```

특수 즉시명령은 클라이언트가 직접 처리한다:

| action_type | 처리 |
|-------------|------|
| `cancelOrder` | `cancel_action_` 세팅 → 다음 틱 `CancelOrder()` |
| `startTeleop` / `stopTeleop` | `TeleopActionHandler` — 주행 취소 후 PAUSED / 재개 후 RUNNING |
| `startPause` / `stopPause` | `PauseOrder()` / `ResumeOrder()` |
| `factsheetRequest` | `PublishRobotFactsheet()` |
| `pause_order` (주문 내 액션) | `pause_order_` 플래그 세팅, `stopTeleop` 올 때까지 RUNNING 유지 |

---

## 클래스 내부 연계 도식도

```
                ┌─────────────── 생성자 ───────────────┐
                │ 파라미터·구독·발행 생성,                │
                │ config.yaml → pluginlib →            │
                │ action_handler_map_[type] = plugin    │
                └─────────────────────────────────────┘
  [구독 콜백]                                  [3개 타이머]
  OrderCallback ───────────┐                  ┌── StateTimerCallback (1Hz)
    └ CanAcceptOrder()      │                  │     └ PublishRobotState() → agv_state
    └ InitAGVState() ───────┤                  ├── ExecuteOrderCallback (5Hz, 메인 루프)
       (node/action_states, ▼                  └── OrderIdCallback (1Hz) → order_id
        client_state=RUNNING)   ┌──── ExecuteOrderCallback (상태기계) ────┐
  InstantActionsCallback        │ cancel_action_? → CancelOrder()          │
    ├ cancelOrder               │ pause_action_?  → PauseOrder()           │
    ├ startTeleop/stopTeleop    │ TF map→base_link 위치 갱신                │
    ├ startPause/stopPause      │ if RUNNING & reached_waypoint_:          │
    ├ factsheetRequest          │   액션 blocking 판정(HARD/SOFT/NONE)      │
    └ 기타 → 핸들러.Execute()     │   ExecuteAction() / 모두 완료 → next_stop_│
  BatteryStateCallback          │   마지막 노드? IDLE : NavigateThroughPoses│
  OdometryCallback              └─────────────────────────────────────────┘
  InfoCallback                          │ 주행                  ▲ 결과
  OrderValidErrorCallback               ▼                      │
                             NavigateThroughPoses() ─ Nav2 action ─▶
                              (status_check 로 active 확인,        NavGoalResponseCallback
                               정지점까지 poses 묶어 전송)          NavFeedbackCallback
                                                                  NavResultCallback → reached_waypoint_
  [플러그인이 부르는 공개 API]
  UpdateActionState/ById ─→ agv_state_.action_states 갱신 + PublishRobotState()
  ActionResponseCallback<T> / ActionResultCallback<T> (헤더 템플릿) ─→ 성공/실패를 액션상태로 매핑
  CreateError / AddError ─→ agv_state_.errors 에 에러 추가
```

---

## 주요 파라미터

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `update_feedback_period` | `1.0` | AGVState 발행 주기 (초) |
| `odom_topic` | `odom` | 속도 추출용 odometry 토픽 |
| `battery_state_topic` | `battery_state` | 배터리 상태 토픽 |
| `robot_type` | `CARRIER` | `MANIPULATOR/CARRIER/FORKLIFT/CONVEYOR/TUGGER/HUMANOID` (비주행형은 위치 갱신 skip) |
| `status_check_service` | `""` | Nav2 ready 확인용 lifecycle `GetState` 서비스 (예: `velocity_smoother/get_state`) |
| `config_file` | `config/client_config.yaml` | 액션 핸들러 설정 파일 경로 |
| `base_frame` | `base_link` | TF 조회 기준 프레임 |

---

## ROS 2 인터페이스

### 구독 (Subscribers)

| 토픽 | 타입 | 설명 |
|------|------|------|
| `client_commands` | `vda5050_msgs/Order` | 주행+작업 주문 |
| `instant_actions_commands` | `vda5050_msgs/InstantActions` | 즉시명령 |
| `battery_state` | `sensor_msgs/BatteryState` | 배터리 |
| `odom` | `nav_msgs/Odometry` | 속도 |
| `order_valid_error` | `std_msgs/String` | 브릿지가 전달한 주문 파싱 에러 |
| `info` | `std_msgs/String` | json_info_generator 집계 정보 |

### 발행 (Publishers)

| 토픽 | 타입 | 설명 |
|------|------|------|
| `agv_state` | `vda5050_msgs/AGVState` | 로봇 상태 보고 (1Hz) |
| `factsheet` | `vda5050_msgs/Factsheet` | 로봇 사양 |
| `order_id` | `std_msgs/String` | 현재 주문 ID (1Hz) |

### 액션 클라이언트 / 서비스 클라이언트

| 이름 | 타입 | 용도 |
|------|------|------|
| `navigate_through_poses` | `nav2_msgs/action/NavigateThroughPoses` | 다중 웨이포인트 주행 |
| `status_check_service` | `lifecycle_msgs/srv/GetState` | Nav2 active 확인 |

---

## 커스텀 활용 방향

### 방향 1: 새 작업 타입 추가

`Vda5050ActionHandlerBase`를 상속한 플러그인을 만들고 `config.yaml`에 등록만 하면 된다. 클라이언트 본체 수정 불필요. → [Action Handlers](action-handlers.md#custom-handler)

### 방향 2: 비주행형 로봇(매니퓰레이터/컨베이어)

`robot_type`을 `MANIPULATOR`/`CONVEYOR`로 두면 `speed_max = 0`이 되어 TF 기반 위치 갱신을 건너뛴다. 주행 없이 노드의 액션만 실행하는 작업 셀에 적합.

### 방향 3: Nav2 준비 게이팅

`status_check_service`를 Nav2 lifecycle 노드(예: `velocity_smoother/get_state`)로 지정하면, 첫 주행 전에 Nav2가 `ACTIVE`인지 확인하고 아니면 다음 틱에 재시도한다.

---

## 참고 자료 (References)

1. **VDA5050 프로토콜 명세** — Order/InstantActions/State 메시지와 blocking 규칙의 원전.
   [https://github.com/VDA5050/VDA5050/blob/main/VDA5050_EN.md](https://github.com/VDA5050/VDA5050/blob/main/VDA5050_EN.md)
2. **Nav2 NavigateThroughPoses** — 다중 웨이포인트 주행 액션.
   [https://docs.nav2.org](https://docs.nav2.org)
3. **pluginlib** — 런타임 C++ 플러그인 로딩.
   [https://github.com/ros/pluginlib](https://github.com/ros/pluginlib)

!!! note "출처"
    본문은 `isaac_ros_vda5050_client` 패키지 (Isaac ROS 4.4.0 기준) 소스코드(`vda5050_client_node.cpp/.hpp`) 분석에 기반한다.
