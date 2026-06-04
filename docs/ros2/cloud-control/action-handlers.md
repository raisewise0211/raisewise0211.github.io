# Action Handler 플러그인 시스템

!!! info "패키지 정보"
    - **인터페이스 패키지**: `vda5050_action_handler` (추상 베이스, 헤더 only)
    - **구현 패키지**: `vda5050_action_handler_plugins` (5개 핸들러)
    - **로딩 방식**: `pluginlib` 런타임 동적 로딩
    - **베이스 클래스**: `isaac_ros::mission_client::Vda5050ActionHandlerBase`
    - **핵심 의존성**: `pluginlib`, `vda5050_msgs`, 외부 인터페이스(manipulation/apriltag/scene_recorder)

---

## 한 줄 요약

> VDA5050 액션 타입을 실제 ROS 액션/서비스 호출로 바꾸는 **교체 가능한 플러그인 계층**. 추상 베이스 4개 메서드(`Initialize/Execute/Cancel/Pause/Resume`)만 구현하면, config 한 줄로 클라이언트에 꽂힌다.

---

## 왜 플러그인 구조인가

Mission Client 본체(`Vda5050ClientNode`)는 "주행과 액션을 언제 실행할지"(스케줄링·blocking 규칙)만 안다. **"각 액션이 무엇을 하는지"는 모른다.** 도킹·픽앤플레이스·지도 교체 같은 구체적 작업은 모두 플러그인으로 분리되어 있어:

- 새 작업 추가 시 **클라이언트 본체를 건드리지 않는다** (config + 플러그인만 추가)
- 작업별 의존성(매니퓰레이션·아프릴태그 등)이 클라이언트로 새지 않는다
- 로봇 종류별로 다른 핸들러 조합을 config로 선택할 수 있다

---

## 추상 베이스: `Vda5050ActionHandlerBase`

`vda5050_action_handler/include/.../vda5050_action_handler.hpp`

```cpp
class Vda5050ActionHandlerBase {
public:
  // 클라이언트 포인터 + config(YAML) 주입. 액션/서비스 클라이언트 생성은 여기서.
  virtual void Initialize(Vda5050ClientNode* client_node, const YAML::Node& config) = 0;

  // 액션 실행. 시작 시 RUNNING, 완료 시 FINISHED/FAILED 로 상태 갱신해야 함.
  virtual void Execute(const vda5050_msgs::msg::Action& vda5050_action) = 0;

  // 취소(기본 빈 구현). 인터럽트 가능하면 구현 → FAILED 로 마감.
  virtual void Cancel(const std::string& action_id) {}

  // 일시정지/재개(can_be_paused == true 일 때 구현)
  virtual void Pause(const std::string& action_id) {}
  virtual void Resume(const std::string& action_id) {}

  bool can_be_paused{false};
protected:
  Vda5050ClientNode* client_node_;   // 상태 갱신 API 호출용
};
```

| 메서드 | 호출 시점 | 책임 |
|--------|-----------|------|
| `Initialize` | 클라이언트 생성자에서 1회 | `client_node_` 저장, 콜백그룹/executor, 외부 액션·서비스 클라이언트 생성, config 읽기 |
| `Execute` | 해당 action_type 실행 시 | `RUNNING`으로 표시 후 외부 서버에 비동기 goal 전송 |
| `Cancel` | `cancelOrder` 핸드셰이크 | 진행 중 작업 인터럽트 → `FAILED` |
| `Pause`/`Resume` | `startPause`/`stopPause` | `PAUSED`/`RUNNING` 전환 |

---

## 공통 구현 패턴

모든 플러그인이 동일한 골격을 따른다:

```cpp
void XxxHandler::Initialize(Vda5050ClientNode* client_node, const YAML::Node& config) {
  client_node_ = client_node;
  callback_group_ = client_node_->create_callback_group(MutuallyExclusive);
  executor_.add_callback_group(callback_group_, client_node_->get_node_base_interface());
  xxx_client_ = rclcpp_action::create_client<XxxAction>(client_node_, "xxx");
  // config["..."] 로 파라미터 읽기
}

void XxxHandler::Execute(const vda5050_msgs::msg::Action& a) {
  client_node_->UpdateActionState(a, ActionState::RUNNING);
  // action_parameters(key/value) → goal 변환
  send_goal_options.goal_response_callback =
      [=](goal){ client_node_->ActionResponseCallback<XxxAction>(goal, a); };
  send_goal_options.result_callback =
      [=](result){ client_node_->ActionResultCallback<...>(a, result, success, desc); };
  if (xxx_client_->wait_for_action_server(timeout))
      xxx_client_->async_send_goal(goal, send_goal_options);
  else
      client_node_->UpdateActionState(a, ActionState::FAILED, "...");
}

// 파일 끝: pluginlib 등록
PLUGINLIB_EXPORT_CLASS(isaac_ros::mission_client::XxxHandler,
                       isaac_ros::mission_client::Vda5050ActionHandlerBase)
```

→ 클라이언트의 헤더 템플릿 `ActionResponseCallback`/`ActionResultCallback`이 goal 수락/결과를 VDA5050 액션 상태로 자동 매핑하므로, 핸들러는 **변환·전송**에만 집중한다.

---

## 플러그인 계층 도식도

```
       vda5050_action_handler.hpp
       ┌─────────────────────────────────────┐
       │ class Vda5050ActionHandlerBase       │  ← 순수 가상 인터페이스
       │   Initialize(client_node*, config)   │     (client_node_ 포인터 보관)
       │   Execute(action)          = 0       │
       │   Cancel/Pause/Resume(id)  {기본 빈}  │
       │   bool can_be_paused                 │
       └─────────────────────────────────────┘
                       ▲ 상속 (PLUGINLIB_EXPORT_CLASS, plugins.xml 등록)
   ┌───────────┬───────────────┬──────────────┬─────────────┬──────────────┬──────────┐
 Docking     PickAndPlace    AprilTag        Map          SceneRecorder   Example
 Handler     Handler         Handler         Handler       Handler         Handler
   │             │               │              │              │             (기본 예제)
 dock_robot   pick_place      get_apriltags  downloadMap   start_recording
 undock_robot get_objects                    enableMap     stop_recording
              clear_objects
              multi_object_pick_and_place
   │             │               │              │              │
   ▼             ▼               ▼              ▼              ▼
 Nav2 Docking  Manipulation   AprilTag       Nav2 map_server  scene_recorder
 +lifecycle    서버(액션/서비스) 검출 토픽      + AMCL          액션 서버
 +switch                      (TF 변환)      + curl 다운로드
```

config는 한 플러그인이 **여러 action_type**을 담당하도록 매핑한다 (`action_handler_map_[type] = plugin`).

---

## 핸들러별 상세

### 1. DockingHandler — `dock_robot` / `undock_robot`

`docking_handler.cpp`

도킹/언도킹을 Nav2 Docking 서버로 수행. 시퀀스가 중요하다:

```
ExecuteDock:
  1. lifecycle_manager_docking 에 RESUME (도킹 서버 활성화)
  2. use_switch=true 면 switch 서비스 ON (센서 전환 등)
  3. action_parameters 파싱: dock_type, dock_pose("x,y,yaw" 정규식 검증), navigate_to_staging_pose
  4. dock_robot 액션 goal 전송
  5. result 콜백: 에러코드 → 설명 매핑(DOCK_NOT_IN_DB/FAILED_TO_DETECT_DOCK/...),
     switch OFF, 도킹 서버 PAUSE

ExecuteUndock:
  1. 도킹 서버 RESUME → undock_robot 액션
  2. trigger_global_localization=true 면 결과 후 AMCL 글로벌 로컬라이제이션 트리거
  3. 도킹 서버 PAUSE
```

| config 키 | 설명 |
|-----------|------|
| `use_switch` | 도킹 전후 `switch` 서비스 토글 여부 |

### 2. PickAndPlaceHandler — 매니퓰레이션 4종

`pick_and_place_handler.cpp` · 의존: `isaac_ros_manipulation_interfaces`

| action_type | 동작 |
|-------------|------|
| `get_objects` | `GetObjects` 액션 → 결과를 **JSON으로 직렬화**(`object_id`, `class_id`, 2D/3D bbox)하여 `result_description`에 담음 |
| `pick_place` | `object_id`, `class_id`, `place_pose`("x,y,z,qx,qy,qz,qw") → `PickPlace` 액션 |
| `clear_objects` | `ClearObjects` 서비스 동기 호출 |
| `multi_object_pick_and_place` | `mode`(MULTI_BIN/SINGLE_BIN), `class_ids`(CSV), `target_poses`(JSON PoseArray) → 멀티 액션. 결과 워크플로 상태(SUCCESS/PARTIAL_SUCCESS/INCOMPLETE) 매핑 |

검출 결과를 mission control이 읽을 수 있는 JSON으로 변환하는 게 특징 (`jsonFromObjectInfo`, `jsonFromDetection2D/3D`). 좌표 파싱은 `nlohmann::json` 사용.

### 3. AprilTagHandler — `get_apriltags`

`apriltag_handler.cpp` · 의존: `isaac_ros_apriltag_interfaces`

태그는 프레임마다 깜빡일 수 있으므로 **버퍼링 + 중복 제거** 알고리즘을 쓴다:

```
executeGetAprilTags:
  is_collecting = true
  100ms 주기 collection_timer 시작 (버퍼 만료 체크)
  action_timeout_timer 시작 (안전망)

aprilTagDetectionCallback (구독):
  빈 배열은 무시
  최신 검출 캐시 갱신
  수집 중이면 unique_apriltag_detections_[tag_id] = detection  (ID로 중복 제거, 최신 유지)

collection_timer (100ms):
  경과 >= apriltag_detection_buffer_time(기본 1s) →
    finalizeAprilTagCollection()

finalize:
  고유 태그들을 JSON 직렬화(tag_id/family/center/pose/frame_id/timestamp)
  apriltag_target_frame 지정 시 TF2 로 좌표 변환(static/dynamic 모드)
  UpdateActionState(FINISHED, json)
```

| config 키 | 기본값 | 설명 |
|-----------|--------|------|
| `apriltag_detections_topic` | `tag_detections` | 검출 구독 토픽 |
| `apriltag_detection_buffer_time` | `1.0` | 고유 태그 수집 시간 (초) |
| `apriltag_action_timeout` | `5.0` | 액션 안전 타임아웃 |
| `apriltag_target_frame` | `""` | 변환 목표 프레임 (빈 값=변환 안 함) |
| `apriltag_transform_mode` | `static` | `static`(최신 TF) / `dynamic`(타임스탬프 매칭) |

### 4. MapHandler — `downloadMap` / `enableMap`

`map_handler.cpp` · 의존: `libcurl`, `nav2_msgs/srv/LoadMap`

런타임 지도 교체. **셸 인젝션을 피하려고** 외부 명령을 `fork`+`execvp`로 직접 실행한다(`RunCommandNoShell`).

```
downloadMap:
  파라미터: mapId, mapVersion, mapDownloadLink
  target_dir = {map_storage_root}/{mapId}_{version}_{timestamp}
  curl 로 다운로드(libcurl 또는 curl 바이너리, "--" 로 옵션 종료)
  unzip 시도 → 실패 시 tar 시도 (압축 해제)
  FINISHED("Map downloaded: ...")

enableMap:
  FindLatestMapDir(mapId, mapVersion) → 가장 최근 디렉터리
  FindMapYaml → map.yaml 탐색
  YAML 검증: image 키 존재 + 이미지 파일 실제 존재
  nav2 map_server LoadMap 서비스 호출
  AMCL 글로벌 로컬라이제이션 트리거 (reinitialize 우선, 없으면 global_localization)
```

| config 키 | 기본값 |
|-----------|--------|
| `map_storage_root` | `/tmp/vda5050_maps` |
| `map_server_load_service` | `/map_server/load_map` |
| `amcl_global_localization_service` | `/amcl/global_localization` |

### 5. SceneRecorderHandler — `start_recording` / `stop_recording` { #scene-recorder-handler }

`scene_recorder_handler.cpp`

[Scene Recorder](supporting-packages.md#scene-recorder) 액션 서버를 호출하는 얇은 프록시.

```
start_recording: 파라미터 path, topics(CSV), time → StartRecording 액션 goal
stop_recording:  StopRecording 액션 goal
```

### Example / gr00t

| 핸들러 | 위치 | 비고 |
|--------|------|------|
| `ExampleActionHandler` | `isaac_ros_vda5050_client/src/example_action_handler.cpp` | 베이스 구현 예제. `period`초 대기 후 `success` 파라미터대로 FINISHED/FAILED. 별도 스레드로 비동기 실행 + `Cancel` 구현 |
| `Gr00tPolicyActionHandler` | **저장소에 없음** | bringup config의 `gr00t_policy`가 참조하나 소스는 별도 휴머노이드 패키지. 로딩 실패 시 클라이언트가 경고 후 skip |

---

## 등록 설정

### config.yaml (bringup의 `vda5050_client_params.yaml` 예시)

```yaml
action_handlers:           # 로드할 핸들러 목록
  - docking
  - pick_and_place
  - scene_recorder
  - apriltag
  - map_handler

docking:
  plugin: isaac_ros::mission_client::DockingHandler   # pluginlib 클래스명
  action_types:            # 이 핸들러가 담당할 VDA5050 action_type 들
    - dock_robot
    - undock_robot
  use_switch: true         # 핸들러별 커스텀 파라미터

apriltag:
  plugin: isaac_ros::mission_client::AprilTagHandler
  action_types: [get_apriltags]
  apriltag_detection_buffer_time: 1.0
  apriltag_target_frame: ""
```

### plugins.xml (pluginlib 매니페스트)

```xml
<library path="vda5050_action_handler_plugins">
  <class type="isaac_ros::mission_client::DockingHandler"
         base_class_type="isaac_ros::mission_client::Vda5050ActionHandlerBase">
    <description>This is a docking action handler plugin.</description>
  </class>
  <!-- PickAndPlace / AprilTag / Map / SceneRecorder / Example ... -->
</library>
```

---

## 커스텀 핸들러 만들기 { #custom-handler }

```cpp
// 1) 베이스 상속
class MyHandler : public isaac_ros::mission_client::Vda5050ActionHandlerBase {
public:
  void Initialize(Vda5050ClientNode* node, const YAML::Node& cfg) override {
    client_node_ = node;
    my_client_ = rclcpp_action::create_client<MyAction>(node, "my_server");
    threshold_ = cfg["threshold"].as<double>(0.5);   // config에서 파라미터
  }
  void Execute(const vda5050_msgs::msg::Action& a) override {
    client_node_->UpdateActionState(a, ActionState::RUNNING);
    // action_parameters → goal 변환 후 async_send_goal,
    // 콜백에서 client_node_->ActionResultCallback<...>() 호출
  }
private:
  rclcpp_action::Client<MyAction>::SharedPtr my_client_;
  double threshold_;
};

// 2) 등록
PLUGINLIB_EXPORT_CLASS(MyHandler, isaac_ros::mission_client::Vda5050ActionHandlerBase)
```

```xml
<!-- 3) plugins.xml 에 <class> 추가 -->
```

```yaml
# 4) config.yaml 에 등록
action_handlers: [..., my_handler]
my_handler:
  plugin: isaac_ros::mission_client::MyHandler
  action_types: [my_action_type]
  threshold: 0.7
```

클라이언트 본체는 한 줄도 고치지 않는다.

---

## 참고 자료 (References)

1. **pluginlib** — ROS 2 런타임 C++ 플러그인 로딩 메커니즘.
   [https://github.com/ros/pluginlib](https://github.com/ros/pluginlib)
2. **Nav2 Docking (opennav_docking)** — `dock_robot`/`undock_robot` 액션 백엔드.
   [https://docs.nav2.org](https://docs.nav2.org)
3. **Isaac ROS AprilTag** — 태그 검출 파이프라인.
   [https://github.com/NVIDIA-ISAAC-ROS/isaac_ros_apriltag](https://github.com/NVIDIA-ISAAC-ROS/isaac_ros_apriltag)

!!! note "출처"
    본문은 `vda5050_action_handler`, `vda5050_action_handler_plugins` 패키지 (Isaac ROS 4.4.0 기준) 소스코드 분석에 기반한다.
