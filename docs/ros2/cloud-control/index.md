# Isaac ROS Cloud Control

!!! info "저장소 정보"
    - **저장소**: `isaac_ros_cloud_control` (NVIDIA-ISAAC-ROS)
    - **역할**: 클라우드 플릿 관리 시스템과 로봇을 잇는 **VDA5050 호환 Mission Client**
    - **통신**: MQTT + [VDA5050 프로토콜](https://github.com/VDA5050/VDA5050/blob/main/VDA5050_EN.md)
    - **주행 백엔드**: [Nav2](https://github.com/ros-navigation/navigation2)
    - **구성**: 13개 ROS 2 패키지 (C++ 핵심 노드 + Python 보조 노드 + 인터페이스/메시지)
    - **기준 버전**: Isaac ROS 4.4.0

---

## 한 줄 요약

> 클라우드 관제(Mission Dispatch)가 **MQTT로 보내는 VDA5050 주문/즉시명령**을 받아, 로봇의 **Nav2 주행**과 **플러그인 액션**(도킹·픽앤플레이스·녹화·지도 등)으로 실행하고, 진행 상태·에러·위치를 다시 클라우드로 보고하는 **미션 클라이언트 스택**.

---

## 무엇을 하는 패키지인가

산업용 AMR(자율이동로봇)을 클라우드에서 관제하려면 표준 통신 규약이 필요하다. **VDA5050**은 마스터 관제(master control)와 AGV 사이의 메시지 포맷·상태 모델을 정의한 산업 표준이며, 보통 **MQTT** 위에서 동작한다.

이 저장소는 그 표준의 **로봇 쪽 절반(client)**을 구현한다:

- 클라우드 → 로봇: `order`(주행+작업 시퀀스), `instantActions`(취소·일시정지·텔레옵 등 즉시 명령)
- 로봇 → 클라우드: `state`(AGVState: 위치·배터리·노드/액션 상태·에러), `factsheet`(로봇 사양), `visualization`, `connection`

매칭되는 클라우드 측(Mission Dispatch)은 [isaac_mission_dispatch](https://github.com/NVIDIA-ISAAC/isaac_mission_dispatch)에서 제공되며, VDA5050/MQTT를 쓰는 다른 플릿 관리 시스템과도 연동 가능하다.

---

## 패키지 한눈에 보기

### 핵심 런타임 패키지

| 패키지 | 언어 | 역할 |
|--------|------|------|
| [`isaac_ros_vda5050_client`](mission-client.md) | C++ | **Mission Client 본체.** 주문/즉시명령 수신 → 상태기계 → Nav2 주행 + 액션 디스패치 → AGVState 발행 |
| [`isaac_ros_mqtt_bridge`](mqtt-bridge.md) | Python | **MQTT ↔ ROS 게이트웨이.** camel↔snake 변환, TLS, 자동 재연결 |
| `vda5050_msgs` | IDL | VDA5050 메시지 타입 28종 (Order, Node, Action, AGVState, ...) |
| [`vda5050_action_handler`](action-handlers.md) | C++ 헤더 | 액션 핸들러 **플러그인 추상 인터페이스** |
| [`vda5050_action_handler_plugins`](action-handlers.md) | C++ | 실제 작업 핸들러 5종 (도킹·픽앤플레이스·아프릴태그·지도·녹화) |
| `isaac_ros_vda5050_client_bringup` | launch/yaml | 위 노드들을 함께 구동하는 launch·config·BT·map |

### 보조/주변 패키지

| 패키지 | 언어 | 역할 |
|--------|------|------|
| [`isaac_ros_json_info_generator`](mqtt-bridge.md#json-info-generator) | Python | 여러 토픽을 모아 JSON으로 직렬화 → `info` 토픽으로 전달 |
| [`isaac_ros_scene_recorder`](supporting-packages.md#scene-recorder) | Python | `start/stop_recording` 액션 서버 (`ros2 bag record` 관리) |
| [`isaac_ros_scene_recorder_interface`](supporting-packages.md#interfaces) | IDL | 녹화 액션 정의 |
| [`isaac_ros_cloud_control_interface`](supporting-packages.md#interfaces) | IDL | `HumanoidTask.action` (gr00t 휴머노이드 작업용) |
| [`isaac_ros_mega_controller`](supporting-packages.md#mega-controller) | Python | 독립 실행: 웨이포인트 순회 + rosbag→S3 |
| [`isaac_ros_mega_node_monitor`](supporting-packages.md#mega-node-monitor) | Python | 노드 헬스체크 서비스 + OpenTelemetry 메트릭 |
| `isaac_ros_mission_client` | meta | 전체 빌드를 묶는 우산 패키지 (코드 없음) |

!!! note "저장소에 없는 핸들러"
    bringup 설정의 `gr00t_policy`(`Gr00tPolicyActionHandler`)는 **이 저장소에 소스가 없다** — 별도 휴머노이드 패키지에서 제공된다. 클라이언트는 플러그인 로딩 실패 시 경고만 내고 건너뛴다.

---

## 패키지 간 연관성 도식도

```
                      ☁️  CLOUD / FLEET MANAGEMENT (Mission Dispatch)
                                    │  MQTT (VDA5050)
                   order, instantActions ▼   ▲ state, factsheet, visualization, connection
    ┌───────────────────────────────────────────────────────────────────────┐
    │                    📦 isaac_ros_mqtt_bridge (Python)                     │
    │           MQTT topic ↔ ROS topic, camel↔snake 변환, TLS, 재연결          │
    └───────────────────────────────────────────────────────────────────────┘
        client_commands │              │ instant_actions_commands     ▲ agv_state
        (Order)         ▼              ▼  (InstantActions)            │ factsheet
    ┌───────────────────────────────────────────────────────────────────────┐
    │             📦 isaac_ros_vda5050_client  (C++, 핵심)                     │
    │  Vda5050ClientNode : 상태기계(IDLE/RUNNING/PAUSED) + 주행 + 액션 디스패치  │
    └───────────────────────────────────────────────────────────────────────┘
       │ uses msgs       │ loads plugins via      │ navigate_through_poses    │ info
       ▼                 ▼ (pluginlib)            ▼ (action)                  ▲
 ┌────────────┐  ┌────────────────────────┐  ┌─────────────┐  ┌────────────────────────────┐
 │📦 vda5050_ │  │📦 vda5050_action_       │  │   Nav2      │  │📦 isaac_ros_json_info_     │
 │   msgs     │◀─│   handler (추상 베이스)  │  │  (외부)      │  │   generator (Python)        │
 │ (28 메시지) │  └────────────────────────┘  └─────────────┘  │  여러 토픽 → JSON → info     │
 └────────────┘             ▲ implements                       └────────────────────────────┘
        ▲                   │
        │       ┌──────────────────────────────────────────────┐
        │       │📦 vda5050_action_handler_plugins (C++)          │
        └───────│ Docking · PickAndPlace · AprilTag · Map ·       │
                │ SceneRecorder  ── 각자 외부 액션/서비스 호출 ──    │
                └──────────────────────────────────────────────┘
                  │dock/undock  │pick/get_objects │start/stop_rec │load_map
                  ▼             ▼                 ▼               ▼
            Nav2 Docking  Manipulation서버  📦 scene_recorder  Nav2 map_server
                          (외부)           (Python 액션서버)    + AMCL
                                                │ uses
                                                ▼
                                  📦 isaac_ros_scene_recorder_interface

  ───────────────────────────  독립 실행(별도 워크플로) ───────────────────────────
   📦 isaac_ros_mega_controller    ──(navigate_to_pose)──▶ Nav2,  ──▶ AWS S3
   📦 isaac_ros_mega_node_monitor  ──(check_nodes_alive 서비스)──▶ OpenTelemetry
   📦 isaac_ros_cloud_control_interface  ──(HumanoidTask.action)──▶ 외부 gr00t 핸들러

  📦 isaac_ros_vda5050_client_bringup : 위 노드들을 launch + config로 묶어 구동
  📦 isaac_ros_mission_client         : 전체 빌드 메타패키지
```

**의존성 방향 요약** (`package.xml` 기준):

- `vda5050_action_handler_plugins` → `isaac_ros_vda5050_client`, `vda5050_action_handler`, 외부 인터페이스(manipulation/apriltag/scene_recorder)
- `isaac_ros_vda5050_client` → `vda5050_action_handler`, `vda5050_msgs`, `mqtt_bridge`, `json_info_generator`, Nav2
- `isaac_ros_scene_recorder` → `scene_recorder_interface`, `vda5050_client`
- `mqtt_bridge` / `json_info_generator` → `vda5050_msgs`, `rosbridge_library`
- `mega_controller` / `mega_node_monitor` → 독립 (Nav2/lifecycle만 의존)

---

## 전체 파일 구조

```
isaac_ros_cloud_control/
│
├── 📦 isaac_ros_mission_client/          [메타] 전체를 묶는 우산 패키지 (코드 없음)
│
├── 📦 vda5050_msgs/                      [인터페이스] VDA5050 메시지 정의 28종
│   └── msg/  Order, Node, Edge, Action, AGVState, InstantActions, Factsheet ...
│
├── 📦 vda5050_action_handler/            [인터페이스] 액션 핸들러 플러그인 추상 베이스
│   └── include/.../vda5050_action_handler.hpp   ← Vda5050ActionHandlerBase
│
├── 📦 isaac_ros_vda5050_client/          [핵심 C++] Mission Client 본체
│   ├── src/vda5050_client_node.cpp       ← 상태기계 + 주행 + 액션 디스패치 (가장 중요)
│   ├── src/vda5050_client_main.cpp       ← main()
│   ├── src/example_action_handler.cpp    ← 예제 플러그인
│   ├── include/.../*.hpp
│   ├── config/config.yaml                ← 기본(예제) 핸들러 설정
│   └── test/  (nav2 시뮬 서버, 주문 JSON들)
│
├── 📦 vda5050_action_handler_plugins/    [플러그인] 실제 작업 핸들러
│   ├── src/docking_handler.cpp           ← dock_robot / undock_robot
│   ├── src/pick_and_place_handler.cpp    ← pick_place / get_objects / multi_object...
│   ├── src/apriltag_handler.cpp          ← get_apriltags
│   ├── src/map_handler.cpp               ← downloadMap / enableMap
│   ├── src/scene_recorder_handler.cpp    ← start/stop_recording
│   └── plugins.xml                       ← pluginlib 등록
│
├── 📦 isaac_ros_vda5050_client_bringup/  [구동/설정] launch + config + map + BT
│   ├── launch/  (메인, nav2, humanoid, navigation, apriltag)
│   ├── config/  (핸들러/내비/휴머노이드/json 파라미터)
│   ├── behavior_trees/  (Nav2 BT)
│   └── maps/
│
├── 📦 isaac_ros_mqtt_bridge/             [Python] MQTT ↔ ROS 변환
│   └── isaac_ros_mqtt_bridge/  MqttRosBridgeNode.py, MqttBridgeUtils.py
│
├── 📦 isaac_ros_json_info_generator/     [Python] 토픽 메시지 → JSON info
│   └── isaac_ros_json_info_generator/JsonInfoGeneratorNode.py
│
├── 📦 isaac_ros_scene_recorder/          [Python] rosbag 녹화 액션 서버
│   └── isaac_ros_scene_recorder/isaac_ros_scene_recorder.py
├── 📦 isaac_ros_scene_recorder_interface/  [인터페이스] StartRecording/StopRecording.action
│
├── 📦 isaac_ros_cloud_control_interface/ [인터페이스] HumanoidTask.action
│
├── 📦 isaac_ros_mega_controller/         [Python 독립] 웨이포인트 순회 + rosbag→S3
├── 📦 isaac_ros_mega_node_monitor/       [Python 독립] 노드 헬스체크 + OTel 메트릭
│
└── utils/ , README.md , LICENSE , SECURITY.md
```

총 **13개 패키지** (코드 노드 6개, 인터페이스 4개, 플러그인 1개, 설정/메타 2개).

---

## 엔드투엔드 흐름: 한 주문의 생애

```
1. 클라우드가 MQTT .../order 로 Order(JSON) 발행
2. mqtt_bridge: JSON → 기본값 채움 → camel→snake → vda5050_msgs/Order 로 client_commands 발행
3. client OrderCallback: CanAcceptOrder() 통과 시 InitAGVState() 로
   node_states/action_states 구성, client_state = RUNNING
4. ExecuteOrderCallback(5Hz): 첫 노드 액션(블로킹 판정) → 핸들러.Execute() → 외부 서버
   주행 필요 구간은 NavigateThroughPoses() → Nav2 navigate_through_poses
5. 노드별로 4 반복, 액션상태 변할 때마다 UpdateActionState → agv_state 발행
6. StateTimer(1Hz): agv_state → mqtt_bridge → snake→camel → MQTT .../state 로 클라우드 보고
   (json_info_generator 가 모은 info, odom 속도, battery 상태도 함께 실림)
7. 마지막 노드까지 완료 → client_state = IDLE ("Order completed")
   (도중 cancelOrder / startPause instantAction 이 오면 핸드셰이크로 중단/일시정지)
```

자세한 내부 동작은 [Mission Client](mission-client.md) 문서를 참고.

---

## 하위 문서

<div class="grid cards" markdown>

-   **Mission Client (VDA5050 Client)**

    ---

    핵심 C++ 노드. 상태기계, Nav2 주행, 액션 블로킹 처리, 취소/일시정지 핸드셰이크.

    [:octicons-arrow-right-24: 자세히 보기](mission-client.md)

-   **Action Handler 플러그인 시스템**

    ---

    pluginlib 기반 확장 메커니즘. 추상 베이스 + 5개 핸들러(도킹·픽앤플레이스·아프릴태그·지도·녹화).

    [:octicons-arrow-right-24: 자세히 보기](action-handlers.md)

-   **MQTT Bridge & 정보 집계**

    ---

    MQTT ↔ ROS 양방향 브릿지, case 변환, TLS/재연결. JSON Info Generator.

    [:octicons-arrow-right-24: 자세히 보기](mqtt-bridge.md)

-   **보조 패키지**

    ---

    Scene Recorder, Mega Controller, Mega Node Monitor, 메시지/인터페이스 정의.

    [:octicons-arrow-right-24: 자세히 보기](supporting-packages.md)

</div>

---

## 참고 자료 (References)

1. **VDA5050 프로토콜 명세** — 마스터 관제와 AGV 간 메시지/상태 모델 표준.
   [https://github.com/VDA5050/VDA5050/blob/main/VDA5050_EN.md](https://github.com/VDA5050/VDA5050/blob/main/VDA5050_EN.md)
2. **Isaac ROS Cloud Control 공식 문서** — 패키지 사용법과 Quickstart.
   [https://nvidia-isaac-ros.github.io/repositories_and_packages/isaac_ros_cloud_control/index.html](https://nvidia-isaac-ros.github.io/repositories_and_packages/isaac_ros_cloud_control/index.html)
3. **Isaac Mission Dispatch** — 매칭되는 클라우드 측 관제 시스템.
   [https://github.com/NVIDIA-ISAAC/isaac_mission_dispatch](https://github.com/NVIDIA-ISAAC/isaac_mission_dispatch)

!!! note "출처"
    본 문서군은 `isaac_ros_cloud_control` 저장소 (Isaac ROS 4.4.0 기준) 소스코드 분석에 기반한다.
