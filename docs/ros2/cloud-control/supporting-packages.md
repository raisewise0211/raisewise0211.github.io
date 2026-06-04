# 보조 패키지

!!! info "다루는 패키지"
    - `isaac_ros_scene_recorder` (Python) — rosbag 녹화 액션 서버
    - `isaac_ros_mega_controller` (Python) — 웨이포인트 순회 + S3 업로드
    - `isaac_ros_mega_node_monitor` (Python) — 노드 헬스체크 + OTel 메트릭
    - `isaac_ros_scene_recorder_interface`, `isaac_ros_cloud_control_interface` — 액션 정의
    - `vda5050_msgs` — VDA5050 메시지 정의

---

## 한 줄 요약

> Mission Client를 둘러싼 보조 도구들: 데이터 **녹화**(scene_recorder), 독립 실행 **웨이포인트 순회+수집**(mega_controller), 시스템 **헬스 모니터링**(mega_node_monitor), 그리고 이들이 쓰는 **메시지/액션 인터페이스**.

---

## Scene Recorder { #scene-recorder }

### 개요

| 항목 | 내용 |
|------|------|
| 패키지 | `isaac_ros_scene_recorder` |
| 노드 | `RecorderActionServer` |
| 역할 | `ros2 bag record` 서브프로세스를 액션으로 시작/정지 |
| 액션 | `start_recording`, `stop_recording` ([정의](#interfaces)) |
| 호출자 | [SceneRecorderHandler](action-handlers.md#scene-recorder-handler) (VDA5050 액션 → 이 서버) |

### 동작

```
RecorderActionServer:
  start_recording 액션 서버, stop_recording 액션 서버

start_recording_action_callback(goal):
  path 이미 존재하면 → success=False ("폴더 존재")
  ros2 bag record --include-hidden-topics -o {path} {topics...} 서브프로세스 시작
  threading.Timer(time_out, stop_recording) 로 자동 종료 예약
  success=True

stop_recording():
  psutil 로 자식 프로세스까지 재귀적으로 SIGINT 전송
  타이머 취소
```

- `subprocess.Popen`으로 `ros2 bag record` 실행, PID 추적
- `psutil`로 자식 프로세스까지 안전하게 종료 (bag record는 자식 프로세스를 띄움)
- `threading.Timer`로 `time` 파라미터 만큼 후 자동 정지 (기본 600초)

### 데이터 흐름

```
VDA5050 start_recording 액션
    │ SceneRecorderHandler.Execute
    ▼
StartRecording.action goal (path, topics[], time)
    │
    ▼
RecorderActionServer → subprocess: ros2 bag record ...
    │ (time_out 후 또는 stop_recording 액션 시)
    ▼
SIGINT → bag 파일 저장 완료
```

---

## Mega Controller { #mega-controller }

### 개요

| 항목 | 내용 |
|------|------|
| 패키지 | `isaac_ros_mega_controller` |
| 노드 | `IsaacRosMegaController` |
| 역할 | **독립 실행.** JSON 웨이포인트를 순서대로 `navigate_to_pose`로 순회하고, 선택적으로 rosbag을 녹화해 S3에 업로드 |
| VDA5050 연관 | **없음** (별도 데이터 수집/데모 워크플로) |
| 의존 | `nav2_msgs`, `lifecycle_msgs`, `boto3` |

### 동작

```
__init__:
  파라미터: waypoints(JSON 파일 경로), nav2_check_interval
  velocity_smoother/get_state 서비스 클라이언트 + navigate_to_pose 액션 클라이언트
  AWS_S3_BUCKET 환경변수 있으면 업로드 활성화
  bag_directory = /tmp/rosbag_{ROS_DOMAIN_ID}_{timestamp}

main:
  1. Nav2(velocity_smoother) 가 'active' 될 때까지 폴링
  2. ROSBagRecorder 컨텍스트(업로드 활성 시) 안에서:
       각 waypoint(x, y, yaw) → PoseStamped(yaw→quaternion) → navigate_to_pose
       goal 거부/실패 시 중단
  3. 업로드 활성 시 upload_to_s3() — boto3 멀티파트 업로드
```

| 클래스 | 역할 |
|--------|------|
| `ROSBagRecorder` | 컨텍스트 매니저. `__enter__`에서 `ros2 bag record -a` 시작, `__exit__`에서 종료 |
| `IsaacRosMegaController` | Nav2 활성 대기, 웨이포인트 순회, S3 업로드 |

!!! note "용도"
    "MEGA"(Multi-Embodiment Generalist Agent) 데모 등에서 정해진 경로를 반복 주행하며 센서 데이터를 수집·업로드하는 **독립 유틸리티**다. Mission Client 상태기계와는 별개로 동작한다.

---

## Mega Node Monitor { #mega-node-monitor }

### 개요

| 항목 | 내용 |
|------|------|
| 패키지 | `isaac_ros_mega_node_monitor` |
| 노드 | `NodeMonitorService` |
| 역할 | 지정 노드들의 생존/active 여부를 확인하는 서비스 + OpenTelemetry `up` 메트릭 |
| 서비스 | `check_nodes_alive` (`std_srvs/Trigger`) |
| 의존 | `rclpy`, `std_srvs`, `opentelemetry-*` |

### 동작

```
__init__:
  파라미터: monitored_nodes[], monitored_lifecycle_nodes[],
            enable_metrics, metrics_interval, enable_3d_lidar_costmap
  ReentrantCallbackGroup + (main에서) MultiThreadedExecutor  ← 비동기 서비스 호출
  check_nodes_alive 서비스 생성
  enable_metrics 면 OTLP exporter + 'up' gauge + 주기 타이머

check_all_nodes():
  일반 노드: get_node_names_and_namespaces() 로 존재 확인
  라이프사이클 노드: {node}/get_state 서비스로 PRIMARY_STATE_ACTIVE 확인
  → {alive_nodes, dead_nodes, inactive_lifecycle_nodes}

check_nodes_callback(Trigger):
  success = (dead 없음 && inactive 없음)
  message = json.dumps(status_dict)

timer_callback (metrics):
  up_metric.set(1 if healthy else 0)  → OTLP export
```

- **두 경로**로 헬스 판단: 일반 노드는 노드 그래프 존재 여부, 라이프사이클 노드는 `get_state` 서비스로 `active` 확인
- `enable_3d_lidar_costmap`이면 3D 라이다 노드를 감시 목록에 자동 추가
- 메트릭은 `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`/`OTEL_EXPORTER_OTLP_PROTOCOL` 환경변수가 있어야 활성화

### 데이터 흐름

```
   외부 호출자 (예: Mission Client status_check, 헬스 대시보드)
        │ check_nodes_alive (Trigger)
        ▼
   NodeMonitorService.check_all_nodes()
   ├─ 일반 노드: 노드 그래프 존재 확인
   └─ 라이프사이클 노드: {node}/get_state → ACTIVE?
        │
        ├─▶ Trigger 응답 (success + JSON 상세)
        └─▶ OpenTelemetry 'up' gauge → OTLP collector
```

---

## 인터페이스 / 메시지 { #interfaces }

### isaac_ros_scene_recorder_interface

| 액션 | Goal | Result |
|------|------|--------|
| `StartRecording.action` | `path`, `topics[]`, `time` | `success`, `result_description` |
| `StopRecording.action` | (없음) | `success`, `result_description` |

### isaac_ros_cloud_control_interface

`HumanoidTask.action` — 휴머노이드(gr00t) 작업용. 저장소에 핸들러 소스는 없지만 인터페이스는 제공.

```
# Goal
string task_category          # manipulation, locomanipulation
string task_id                # pick_and_place, assembly, follow_natural_language ...
geometry_msgs/PoseStamped locomotion_pose
string language_instruction   # VLA 자연어 명령
float32 timeout
string parameters             # 정책별 JSON 입력
---
# Result
bool did_succeed
string message
geometry_msgs/PoseStamped final_locomotion_pose
sensor_msgs/JointState final_joint_state
float32 execution_time
string result_data
---
# Feedback
int32 status                  # IDLE/EXECUTING/COMPLETED/FAILED/CANCELLED
float32 current_execution_time
geometry_msgs/PoseStamped current_base_pose
sensor_msgs/JointState current_joint_state
string current_instruction
```

### vda5050_msgs

VDA5050 프로토콜 메시지 28종. Mission Client·브릿지·플러그인이 모두 의존하는 **공통 데이터 모델**.

| 그룹 | 메시지 |
|------|--------|
| 주문(하향) | `Order`, `Node`, `Edge`, `NodePosition`, `Action`, `ActionParameter`, `Trajectory`, `ControlPoint`, `InstantActions` |
| 상태(상향) | `AGVState`, `NodeState`, `EdgeState`, `ActionState`, `AGVPosition`, `Velocity`, `BatteryState`, `Load`, `LoadDimensions`, `SafetyState`, `Error`, `ErrorReference`, `Info`, `InfoReference` |
| 기타 | `Factsheet`, `TypeSpecification`, `PhysicalParameters`, `Visualization`, `BoundingBoxReference` |

핵심 계층 구조:

```
Order
├─ Node[]
│  ├─ NodePosition (x, y, theta, allowed_deviation_x_y)
│  └─ Action[]  (action_type, action_id, blocking_type, ActionParameter[])
└─ Edge[]

AGVState
├─ AGVPosition (x, y, theta, position_initialized, ...)
├─ Velocity (vx, vy, omega)
├─ BatteryState (charge, voltage, charging)
├─ NodeState[] / EdgeState[]
├─ ActionState[]  (action_id, action_status: WAITING/RUNNING/PAUSED/FINISHED/FAILED)
├─ Error[] (error_level: WARNING/FATAL)
└─ SafetyState (e_stop, field_violation)
```

자세한 사용은 [Mission Client](mission-client.md) 참고.

---

## 참고 자료 (References)

1. **VDA5050 프로토콜 명세** — 메시지/액션 정의의 원전.
   [https://github.com/VDA5050/VDA5050/blob/main/VDA5050_EN.md](https://github.com/VDA5050/VDA5050/blob/main/VDA5050_EN.md)
2. **OpenTelemetry Python** — 메트릭 export(OTLP).
   [https://opentelemetry.io/docs/languages/python/](https://opentelemetry.io/docs/languages/python/)
3. **rosbag2** — `ros2 bag record` 백엔드.
   [https://github.com/ros2/rosbag2](https://github.com/ros2/rosbag2)

!!! note "출처"
    본문은 `isaac_ros_scene_recorder`, `isaac_ros_mega_controller`, `isaac_ros_mega_node_monitor` 및 인터페이스/메시지 패키지 (Isaac ROS 4.4.0 기준) 소스코드 분석에 기반한다.
