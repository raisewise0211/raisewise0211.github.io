# MPPI Controller

!!! info "패키지 정보"
    - **패키지**: `nav2_mppi_controller`
    - **알고리즘**: Model Predictive Path Integral (MPPI)
    - **역할**: Nav2의 플러그인 기반 지역 경로 추종(local path following) 컨트롤러
    - **기준 버전**: Nav2 Jazzy / Rolling
    - **핵심 의존성**: Eigen3, pluginlib, nav2_costmap_2d

---

## 한 줄 요약

> 확률적 샘플링과 정보이론 기반 가중치 업데이트를 통해 최적 제어 시퀀스를 실시간으로 계산하는 Nav2 지역 컨트롤러. 볼록 최적화 없이 비선형·비볼록 비용함수를 직접 다룬다.

---

## 패키지 개요

| 항목 | 내용 |
|------|------|
| 알고리즘 | Model Predictive Path Integral (MPPI) |
| 제어 주기 | 실시간 (기본 controller_frequency에 맞춰) |
| 핵심 의존성 | Eigen3 (행렬 연산), pluginlib (플러그인), nav2_costmap_2d |
| 확장 포인트 | MotionModel, CriticFunction, OptimalTrajectoryValidator (모두 pluginlib) |
| 연산 방식 | 배치 행렬 연산 (Eigen ArrayXXf), 선택적 멀티스레딩 (NoiseGenerator) |

---

## 전체 파일 구조

```
nav2_mppi_controller/
├── src/
│   ├── controller.cpp                        # ROS2 플러그인 진입점
│   ├── optimizer.cpp                         # MPPI 알고리즘 핵심
│   ├── critic_manager.cpp                    # Critic 플러그인 로더/실행기
│   ├── noise_generator.cpp                   # 가우시안 노이즈 샘플링
│   ├── motion_models.cpp                     # 로봇 운동 모델 (diff/omni/ackermann)
│   ├── parameters_handler.cpp                # 동적 파라미터 관리
│   ├── trajectory_visualizer.cpp             # RViz 시각화
│   ├── trajectory_validators/
│   │   └── optimal_trajectory_validator.cpp  # 궤적 유효성 검사
│   └── critics/
│       ├── constraint_critic.cpp             # 속도 제약 위반 페널티
│       ├── cost_critic.cpp                   # 코스트맵 비용 회피
│       ├── goal_critic.cpp                   # 목표점 유도
│       ├── goal_angle_critic.cpp             # 목표 방향 정렬
│       ├── obstacles_critic.cpp              # 장애물 회피
│       ├── path_align_critic.cpp             # 경로 정렬
│       ├── path_angle_critic.cpp             # 경로 방향 정렬
│       ├── path_follow_critic.cpp            # 경로 추종
│       ├── prefer_forward_critic.cpp         # 전진 우선
│       ├── twirling_critic.cpp               # 회전 진동 억제
│       └── velocity_deadband_critic.cpp      # 속도 데드밴드 강제
├── include/nav2_mppi_controller/
│   ├── controller.hpp
│   ├── optimizer.hpp
│   ├── critic_manager.hpp
│   ├── critic_function.hpp                   # Critic 추상 기반 클래스
│   ├── critic_data.hpp                       # Critic 공유 데이터 구조
│   ├── motion_models.hpp
│   ├── optimal_trajectory_validator.hpp
│   ├── models/
│   │   ├── state.hpp                         # 배치 속도 상태
│   │   ├── control_sequence.hpp              # 제어 시퀀스
│   │   ├── trajectories.hpp                  # 생성된 궤적들
│   │   ├── path.hpp                          # 참조 경로
│   │   ├── constraints.hpp                   # 제어 제약 조건
│   │   └── optimizer_settings.hpp           # MPPI 전체 설정
│   └── tools/
│       ├── noise_generator.hpp
│       ├── parameters_handler.hpp
│       ├── trajectory_visualizer.hpp
│       └── utils.hpp                         # 기하/수학/변환 유틸리티
```

---

## 핵심 알고리즘: MPPI 이론

### MPPI란?

MPPI(Model Predictive Path Integral)는 정보이론 기반의 확률적 최적 제어 알고리즘이다.
기존 MPC와 달리 볼록 최적화(convex optimization) 없이도 **비선형·비볼록 비용함수**를 처리할 수 있다.

### 수학적 원리

**1단계: 노이즈 샘플링**

현재 최적 제어 시퀀스 \(U^* = \{u_0, u_1, ..., u_{T-1}\}\) 에 가우시안 노이즈를 추가해 \(K\)개의 후보 시퀀스 생성:

\[
\tilde{U}^{(k)} = U^* + \epsilon^{(k)}, \quad \epsilon^{(k)} \sim \mathcal{N}(0, \Sigma)
\]

- \(K\): `batch_size` (기본 1000)
- \(T\): `time_steps` (기본 56)
- \(\Sigma\): 샘플링 표준편차 대각행렬 (`vx_std`, `vy_std`, `wz_std`)

**2단계: 궤적 롤아웃**

각 제어 시퀀스를 운동 모델(Motion Model)로 적분하여 \(K\)개의 후보 궤적 생성:

\[
x_{t+1}^{(k)} = f(x_t^{(k)}, \tilde{u}_t^{(k)})
\]

**3단계: 비용 평가**

각 궤적의 총 비용 \(S^{(k)}\)를 Critic들이 평가:

\[
S^{(k)} = \sum_{\text{critic } c} w_c \cdot \text{cost}_c(\tau^{(k)})
\]

**4단계: 소프트맥스 가중 업데이트 (정보이론적 핵심)**

낮은 비용의 궤적에 높은 가중치를 부여하여 제어 시퀀스 업데이트:

\[
\beta = \min_k S^{(k)}
\]

\[
w^{(k)} = \frac{1}{\eta} \exp\left(-\frac{1}{\lambda}(S^{(k)} - \beta)\right), \quad \eta = \sum_k w^{(k)}
\]

\[
U^* \leftarrow \sum_{k=1}^{K} w^{(k)} \cdot \tilde{U}^{(k)}
\]

- \(\lambda\): `temperature` (기본 0.3) — 낮을수록 최저비용 궤적에 집중
- \(\gamma\): `gamma` (기본 0.015) — 제어 입력 크기에 대한 정규화 항

**5단계: Savitzky-Golay 필터**

업데이트된 제어 시퀀스를 9포인트 창의 S-G 필터로 스무딩하여 부드러운 명령 생성.

**6단계: 반복 정제**

위 1~5단계를 `iteration_count`번 반복하여 로컬 최적해로 수렴.

---

## 각 파일 역할 및 함수/클래스 설명

### `controller.cpp` — 메인 ROS2 플러그인

**클래스**: `mppi::MPPIController`
**상속**: `nav2_core::Controller`
**역할**: Nav2 플러그인 인터페이스 구현. 수명주기(lifecycle) 관리, 외부로부터 경로·속도를 수신하고 속도 명령을 출력.

| 메서드 | 설명 |
|--------|------|
| `configure(node, name, tf, costmap_ros)` | 플러그인 초기화. `Optimizer`, `TrajectoryVisualizer`, `ParametersHandler` 생성 및 설정 |
| `cleanup()` | 리소스 해제, publisher/subscriber 제거 |
| `activate()` | 플러그인 활성화, publisher 활성화 |
| `deactivate()` | 플러그인 비활성화 |
| `computeVelocityCommands(pose, velocity, checker)` | **핵심 메서드**: `Optimizer::evalControl()` 호출 후 `TwistStamped` 반환 |
| `setPath(path)` | 신규 전역 경로 수신 시 호출, Optimizer에 전달 |
| `setSpeedLimit(speed_limit, percentage)` | 동적 속도 제한 설정 (퍼센트 또는 절대값) |
| `visualize(optimal_trajectory)` | RViz에 최적 궤적과 후보 궤적 퍼블리시 |

**주요 내부 구조**:

- `Optimizer optimizer_` — 최적화 엔진
- `TrajectoryVisualizer trajectory_visualizer_` — 시각화
- `ParametersHandler parameters_handler_` — 동적 파라미터

---

### `optimizer.cpp` — MPPI 최적화 엔진

**클래스**: `mppi::Optimizer`
**역할**: MPPI 알고리즘 전체 실행. 노이즈 생성 → 궤적 롤아웃 → 비용 평가 → 제어 업데이트의 루프를 관리.

| 메서드 | 설명 |
|--------|------|
| `initialize(parent, name, costmap_ros, tf_buffer, param_handler)` | CriticManager, NoiseGenerator, MotionModel, TrajectoryValidator 초기화 |
| `evalControl(pose, speed, plan, goal, checker)` | **외부 호출 진입점**: `prepare()→optimize()→validate()` 반복 후 TwistStamped + 궤적 반환 |
| `optimize()` | `iteration_count`회 반복: `generateNoisedTrajectories()→evalTrajectoriesScores()→updateControlSequence()` |
| `prepare(pose, speed, plan, goal, checker)` | 로봇 상태와 참조 경로를 `State`, `Path` 구조체로 변환 |
| `generateNoisedTrajectories()` | NoiseGenerator 이용해 배치 제어 시퀀스 생성 후 Motion Model로 궤적 적분 |
| `integrateStateVelocities(traj, state)` | 속도를 RK(Euler) 방식으로 적분해 x,y,yaw 궤적 생성 |
| `updateControlSequence()` | 소프트맥스 가중 평균으로 최적 제어 시퀀스 갱신, S-G 필터 적용 |
| `getOptimizedTrajectory()` | 최적 제어 시퀀스로 단일 궤적 계산 후 반환 |
| `fallback(fail)` | 실패 시 리셋 후 재시도. `retry_attempt_limit` 초과 시 예외 발생 |
| `reset(reset_dynamic_speed_limits)` | 상태/비용/히스토리 배열 초기화 |
| `setSpeedLimit(speed_limit, percentage)` | 제약 조건 동적 업데이트 |
| `setMotionModel(name)` | pluginlib으로 MotionModel 플러그인 로드 |
| `shiftControlSequence()` | 제어 시퀀스를 1스텝 앞으로 시프트 (lookahead) |
| `getControlFromSequenceAsTwist(stamp)` | 시퀀스 첫 번째 제어를 TwistStamped로 변환 |
| `isHolonomic()` | 홀로노믹 로봇 여부 반환 |
| `isSpeedLimitActive()` | 현재 속도 제한 활성 여부 |

**핵심 멤버 변수**:

| 변수 | 타입 | 설명 |
|------|------|------|
| `state_` | `models::State` | 배치 속도 상태 `[batch_size × time_steps]` |
| `control_sequence_` | `models::ControlSequence` | 현재 최적 제어 시퀀스 `[time_steps]` |
| `generated_trajectories_` | `models::Trajectories` | 생성된 후보 궤적 `[batch_size × time_steps]` |
| `costs_` | `Eigen::ArrayXf` | 각 궤적의 총 비용 `[batch_size]` |
| `critics_data_` | `CriticData` | 모든 Critic에 전달되는 공유 데이터 |
| `control_history_` | `std::array<Control, 4>` | 최근 4개의 제어 명령 (S-G 필터용) |
| `settings_` | `models::OptimizerSettings` | MPPI 파라미터 전체 |

---

### `critic_manager.cpp` — Critic 플러그인 관리자

**클래스**: `mppi::CriticManager`
**역할**: pluginlib을 통해 CriticFunction 플러그인들을 로드하고, 매 반복마다 모든 Critic을 실행하여 비용 배열을 채움.

| 메서드 | 설명 |
|--------|------|
| `on_configure(parent, name, costmap_ros, param_handler)` | 파라미터에서 critic 이름 목록 읽어 pluginlib으로 로드 및 초기화 |
| `evalTrajectoriesScores(data)` | 로드된 모든 Critic의 `score(data)` 순서대로 호출. `data.costs`에 누적 |
| `getCriticCosts()` | 각 Critic별 개별 비용 반환 (디버깅용) |

**로드 방식**: `pluginlib::ClassLoader<CriticFunction>` 사용. critics.xml에 플러그인 등록.

---

### `noise_generator.cpp` — 노이즈 샘플링

**클래스**: `mppi::NoiseGenerator`
**역할**: 제어 시퀀스에 추가할 가우시안 노이즈를 생성. 선택적으로 백그라운드 스레드로 병렬 생성 가능.

| 메서드 | 설명 |
|--------|------|
| `initialize(settings, is_holonomic, name, param_handler)` | 노이즈 분포 설정, 스레드 옵션 설정 |
| `setNoisedControls(state, control_sequence)` | 현재 최적 제어 + 노이즈 → `state.cvx`, `state.cvy`, `state.cwz` |
| `generateNextNoises()` | 다음 반복에 쓸 노이즈를 미리 생성 (스레드 신호) |
| `reset(settings, is_holonomic)` | 노이즈 배열 재초기화 |
| `generateNoisedControls()` | 실제 노이즈 샘플링 수행 (Eigen 배열에 저장) |
| `noiseThread()` | 백그라운드 스레드 루프: `noise_cond_` 신호 대기 후 노이즈 생성 |
| `shutdown()` | 스레드 종료 처리 |

**핵심 멤버**:

| 변수 | 타입 | 설명 |
|------|------|------|
| `noises_vx_`, `noises_vy_`, `noises_wz_` | `Eigen::ArrayXXf` | 노이즈 배열 `[batch_size × time_steps]` |
| `ndistribution_vx_`, `ndistribution_vy_`, `ndistribution_wz_` | `std::normal_distribution<float>` | 각 축의 정규분포 |
| `noise_thread_` | `std::thread` | 비동기 노이즈 생성 스레드 |
| `noise_cond_` | `std::condition_variable` | 스레드 동기화 |

---

### `motion_models.cpp` — 운동 모델

**기반 클래스**: `mppi::MotionModel` (추상)
**역할**: 로봇의 운동학(kinematics)/동역학 제약을 모델링. 제어 입력을 실제 달성 가능한 속도로 변환.

| 메서드 | 설명 |
|--------|------|
| `predict(state)` | 모든 배치에 대해 현재 속도에서 제어 목표까지 가속도 제약 내로 속도 업데이트 |
| `setConstraints(constraints, model_dt)` | 속도·가속도 한계 설정 |
| `applyConstraints(state)` | 서브클래스별 추가 제약 적용 (순수 가상) |
| `isHolonomic()` | 홀로노믹 여부 (순수 가상) |

**구현체 세 종류**:

| 클래스 | 적용 로봇 | `isHolonomic()` | 특징 |
|--------|-----------|-----------------|------|
| `DiffDriveMotionModel` | 차동 구동 | `false` | `vy=0` 강제, vx·wz만 제어 |
| `OmniMotionModel` | 전방향 이동 | `true` | vx, vy, wz 모두 독립 제어 |
| `AckermannMotionModel` | 자동차형 조향 | `false` | 최소 회전 반경 강제: `wz ≤ vx / r_min` |

**`AckermannMotionModel` 추가 메서드**:

- `getMinTurningRadius()`: 파라미터로 설정된 최소 회전 반경 반환
- `applyConstraints(state)`: wz 값을 최소 회전 반경에 맞게 클램핑

---

### `parameters_handler.cpp` — 동적 파라미터 관리

**클래스**: `mppi::ParametersHandler`
**역할**: ROS2 `rcl_interfaces`의 동적 파라미터 업데이트를 관리. 검증(pre-callback) → 적용(post-callback) 파이프라인 제공.

| 메서드 | 설명 |
|--------|------|
| `getParamGetter(ns)` | 네임스페이스 지정된 파라미터 읽기 람다 반환. `declare_parameter_if_not_declared` 포함 |
| `setParamCallback()` | 동적 파라미터 콜백 등록 |
| `addPreCallback(param_name, callback)` | 파라미터 업데이트 전 검증 콜백 등록 |
| `addPostCallback(callback)` | 파라미터 업데이트 후 실행될 콜백 등록 |
| `validateParameterUpdatesCallback(params)` | 등록된 pre-callback 모두 실행, 하나라도 실패하면 거부 |
| `updateParametersCallback(params)` | 등록된 post-callback 실행 (파라미터 적용 완료 후) |

**설계 특징**:

- 뮤텍스(`std::mutex`)로 파라미터 변경 중 레이스 컨디션 방지
- 속도 제한 활성 상태에서 운동학 파라미터 업데이트 거부 (kinematic_guard)

---

### `trajectory_visualizer.cpp` — 시각화

**클래스**: `mppi::TrajectoryVisualizer`
**역할**: 후보 궤적들과 최적 궤적을 RViz MarkerArray로 퍼블리시. 비용에 따른 색상 그라디언트 적용.

| 메서드 | 설명 |
|--------|------|
| `on_configure(parent, name, costmap_frame, node)` | 퍼블리셔 생성 (`candidate_trajectories`, `optimal_path`) |
| `add(trajectory, ns, stamp)` | 최적 궤적을 `nav_msgs/Path`로 추가 |
| `add(trajectories, costs, collisions, stamp)` | 후보 궤적들을 비용에 따른 색상으로 MarkerArray에 추가 |
| `visualize(stamp)` | 모든 마커 퍼블리시 후 버퍼 초기화 |
| `costToColor(cost, min_cost, max_cost)` | 비용값을 초록(낮음)→노랑→빨강(높음) 색상으로 변환 |
| `addCostColoredTrajectory(traj, cost, stamp)` | LINE_STRIP 마커로 단일 궤적 추가 |

---

### `optimal_trajectory_validator.cpp` — 궤적 유효성 검사

**클래스**: `mppi::DefaultOptimalTrajectoryValidator`
**기반 클래스**: `mppi::OptimalTrajectoryValidator` (pluginlib 추상)
**역할**: 최적화된 궤적이 실제로 충돌 없이 주행 가능한지 검사. 실패 시 재시도 또는 하드 실패 트리거.

**반환 열거형**:

| `ValidationResult` | 의미 |
|--------------------|------|
| `SUCCESS` | 궤적 유효, 그대로 사용 |
| `SOFT_RESET` | 충돌 감지, 옵티마이저 리셋 후 재시도 |
| `FAILURE` | 복구 불가, `NoValidControl` 예외 발생 |

| 메서드 | 설명 |
|--------|------|
| `initialize(parent, name, costmap_ros, param_handler, tf_buffer, settings)` | 충돌 검사기 설정 |
| `validateTrajectory(optimal_traj, control_seq, pose, speed, plan, goal)` | 궤적 점들을 코스트맵으로 충돌 검사 |

---

### Critic 구현체들

모든 Critic은 `mppi::critics::CriticFunction`을 상속하며 `score(CriticData & data)` 메서드로 `data.costs`에 비용을 누적합니다.

#### 공통 파라미터

| 파라미터 | 설명 |
|----------|------|
| `enabled` | Critic 활성화 여부 |
| `cost_weight` | 이 Critic 비용의 전체 가중치 |
| `cost_power` | 비용에 지수 승 적용 (`cost^power`) |

#### `ConstraintCritic`

**목적**: 속도 제약 조건 위반 궤적에 페널티 부여.

비용 계산:

```
cost += weight * (|vx| > vx_max || |vx| < vx_min || |vy| > vy_max || |wz| > wz_max 인 스텝 수)^power
```

#### `CostCritic`

**목적**: 코스트맵의 인플레이션 레이어 비용을 기반으로 장애물 근접 회피.

비용 계산:

```
- footprint 고려 시: 실제 발자국 형태로 충돌 검사
- 포인트 검사 시: 해당 셀의 코스트 값 직접 사용
- critical_cost 이상이면 해당 궤적 fail_flag 설정
```

#### `GoalCritic`

**목적**: 궤적 끝점을 목표 지점으로 유도.

비용 계산:

```
goal_dist = ||trajectory_endpoint - goal||
cost += weight * goal_dist^power  (목표 근처에서만 활성)
```

#### `GoalAngleCritic`

**목적**: 목표에 가까워졌을 때 목표 방향(heading)으로 정렬.

비용 계산:

```
angle_diff = |yaw_trajectory - yaw_goal|
cost += weight * angle_diff^power  (목표 반경 내에서만 활성, symmetric_yaw 옵션 지원)
```

#### `ObstaclesCritic`

**목적**: 동적 장애물 회피. CostCritic보다 여유 마진을 더 두어 작동.

비용 계산:

```
- collision_margin_distance 이내 접근 시 반발력 비용
- repulsion_weight * (1 - dist/margin)^power
```

#### `PathAlignCritic`

**목적**: 궤적이 참조 경로와 공간적으로 정렬되도록 강제.

비용 계산:

```
nearest_path_point_dist = min(||traj_point - path_point|| for each step)
cost += weight * sum(nearest_dist)^power
(use_path_orientations=true이면 방향 오차도 포함)
```

#### `PathAngleCritic`

**목적**: 궤적의 헤딩이 경로 방향과 일치하도록 강제.

**PathAngleMode 열거형**:

| 모드 | 설명 |
|------|------|
| `FORWARD_PREFERENCE` | 전진 방향 우선 |
| `NO_DIRECTIONAL_PREFERENCE` | 방향 무관 (대칭) |
| `CONSIDER_FEASIBLE_PATH_ORIENTATIONS` | 경로상 실현 가능 방향만 고려 |

#### `PathFollowCritic`

**목적**: 경로상 `offset_from_furthest` 앞 지점을 향해 궤적을 유도. 경로 진행률 극대화.

비용 계산:

```
lookahead_point = path[furthest_reached_idx + offset_from_furthest]
cost += weight * ||trajectory_end - lookahead_point||^power
```

#### `PreferForwardCritic`

**목적**: 후진(vx < 0) 궤적에 페널티. 전진 우선 이동 강제.

비용 계산:

```
cost += weight * (vx < 0인 스텝 수)^power
```

#### `TwirlingCritic`

**목적**: 불필요한 회전 진동(wz 변화) 억제.

비용 계산:

```
cost += weight * sum(|wz|)^power
```

#### `VelocityDeadbandCritic`

**목적**: 설정된 속도 데드밴드 내 작은 속도 명령 억제 (정지/미끄러짐 방지).

비용 계산:

```
deadband_velocities = [vx_deadband, vy_deadband, wz_deadband]
cost += weight * (각 축에서 |v| < deadband 인 스텝 수)^power
```

---

### 데이터 모델 헤더

#### `models/state.hpp` — `mppi::models::State`

```cpp
struct State {
  Eigen::ArrayXXf vx, vy, wz;     // 실제 달성 속도 [batch_size × time_steps]
  Eigen::ArrayXXf cvx, cvy, cwz;  // 제어 목표 속도 (optimal + noise) [batch_size × time_steps]
  geometry_msgs::msg::PoseStamped pose;  // 현재 로봇 포즈
  geometry_msgs::msg::Twist speed;       // 현재 로봇 속도
  float local_path_length;               // 로컬 경로 길이
};
```

#### `models/control_sequence.hpp` — `mppi::models::ControlSequence`

```cpp
struct ControlSequence {
  Eigen::ArrayXf vx, vy, wz;  // 최적 제어 시퀀스 [time_steps]
  void reset(unsigned int time_steps);
};
```

#### `models/trajectories.hpp` — `mppi::models::Trajectories`

```cpp
struct Trajectories {
  Eigen::ArrayXXf x, y, yaws;  // 후보 궤적 위치/방향 [batch_size × time_steps]
  void reset(unsigned int batch_size, unsigned int time_steps);
};
```

#### `models/path.hpp` — `mppi::models::Path`

```cpp
struct Path {
  Eigen::ArrayXf x, y, yaws;  // 참조 경로 웨이포인트
  void reset(unsigned int size);
};
```

#### `models/constraints.hpp`

```cpp
struct ControlConstraints {
  float vx_max, vx_min;         // 전진/후진 최대 속도
  float vy;                     // 횡방향 최대 속도
  float wz;                     // 최대 각속도
  float ax_max, ax_min;         // 전/후 최대 가속도
  float ay_max, ay_min;         // 횡 최대 가속도
  float az_max;                 // 최대 각가속도
};

struct SamplingStd {
  float vx, vy, wz;             // 노이즈 샘플링 표준편차
};
```

#### `critic_data.hpp` — `mppi::CriticData`

모든 Critic에 전달되는 공유 참조 컨테이너:

```cpp
struct CriticData {
  const models::State & state;                  // 배치 속도 상태
  const models::Trajectories & trajectories;    // 후보 궤적
  const models::Path & path;                    // 참조 경로
  const geometry_msgs::msg::Pose & goal;        // 목표 포즈
  Eigen::ArrayXf & costs;                       // 누적 비용 [batch_size]
  float model_dt;                               // 모델 타임스텝
  bool & fail_flag;                             // 실패 플래그
  nav2_core::GoalChecker * goal_checker;
  std::optional<size_t> furthest_reached_path_point;  // 경로상 최대 도달 지점 (캐시)
  std::optional<Eigen::ArrayXf> path_pts_valid;        // 경로 점 유효성 캐시
};
```

---

### `utils.hpp` — 유틸리티 함수

`mppi::utils` 네임스페이스에 정적 인라인 함수 모음.

**기하 유틸리티**:

| 함수 | 설명 |
|------|------|
| `createPose(x, y, z)` | geometry_msgs::Pose 생성 |
| `createScale(x, y, z)` | Vector3 생성 |
| `createColor(r, g, b, a)` | ColorRGBA 생성 |
| `createMarker(id, pose, scale, color, frame)` | 마커 메시지 생성 |
| `toTwistStamped(vx, vy, wz, stamp)` | TwistStamped 메시지 생성 |
| `toTensor(path, tensor, point_count)` | nav_msgs::Path → `models::Path` 변환 |
| `toTrajectoryMsg(trajectory, frame, stamp)` | Eigen 배열 → `nav_msgs::Trajectory` 변환 |

**수학 유틸리티**:

| 함수 | 설명 |
|------|------|
| `normalize_angles(angles)` | 각도를 \([-\pi, \pi]\)로 정규화 (Eigen 배열) |
| `shortest_angular_distance(from, to)` | 최단 각도 차이 계산 |
| `posePointAngle(pose, px, py, forward)` | 포즈에서 점까지의 각도 |
| `savitskyGolayFilter(sequence, sgf_order)` | 9포인트 Savitzky-Golay 필터로 제어 시퀀스 스무딩 |
| `shiftColumnsByOnePlace(matrix, direction)` | 행렬 열을 1칸 시프트 (lookahead용) |
| `normalize_yaws_between_points(path)` | 경로 점 간 연속적인 yaw 계산 |
| `clamp(value, min, max)` | 값 클램핑 |
| `clampVelocityByAccel(v_curr, v_target, accel_max, dt)` | 가속도 제약 내 속도 클램핑 |

**경로 유틸리티**:

| 함수 | 설명 |
|------|------|
| `findPathFurthestReachedPoint(data)` | 배치 궤적에서 경로상 가장 멀리 도달한 인덱스 탐색 |
| `findPathCosts(data, checker, costmap_ros)` | 경로 점들의 코스트맵 비용 평가 |
| `setPathFurthestPointIfNotSet(data)` | `furthest_reached_path_point` 레이지 초기화 |

---

## 파일 간 연계 관계 도식도

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Nav2 Controller Server                        │
│                    (nav2_controller::ControllerServer)                  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ nav2_core::Controller 인터페이스
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       MPPIController (controller.cpp)                   │
│   - configure() / activate() / deactivate() / cleanup()                 │
│   - computeVelocityCommands() ──────────────────────────────────────┐   │
│   - setPath() / setSpeedLimit()                                     │   │
└─────────┬───────────────────────────────┬───────────────────────────┼───┘
          │                               │                           │
          ▼                               ▼                           │
┌──────────────────────┐    ┌────────────────────────────┐           │
│  ParametersHandler   │    │   TrajectoryVisualizer     │           │
│  - getParamGetter()  │    │   - add() / visualize()    │           │
│  - addPreCallback()  │    │   - costToColor()          │           │
│  - addPostCallback() │    └────────────────────────────┘           │
└──────────┬───────────┘                                              │
           │ (공유 참조)                                               │
           ▼                                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Optimizer (optimizer.cpp)                        │
│                                                                          │
│  evalControl()                                                           │
│    ├─ prepare()          → State, Path 초기화                            │
│    ├─ optimize() [N회]                                                   │
│    │   ├─ generateNoisedTrajectories()                                   │
│    │   │   ├── NoiseGenerator.setNoisedControls()  ──────────────────┐  │
│    │   │   └── MotionModel.predict() + integrateStateVelocities()     │  │
│    │   ├─ CriticManager.evalTrajectoriesScores()   ──────────────┐   │  │
│    │   └─ updateControlSequence()   (softmax + S-G filter)       │   │  │
│    ├─ getOptimizedTrajectory()                                    │   │  │
│    └─ TrajectoryValidator.validateTrajectory()  ──────────────┐  │   │  │
│                                                               │  │   │  │
└───────────────────────────────────────────────────────────────┼──┼───┼──┘
                                                                │  │   │
        ┌───────────────────────────────────────────────────────┘  │   │
        ▼                                                           │   │
┌───────────────────────────────────────────┐                      │   │
│  DefaultOptimalTrajectoryValidator        │                      │   │
│  (trajectory_validators/...)              │                      │   │
│  - validateTrajectory()                   │                      │   │
│    → SUCCESS / SOFT_RESET / FAILURE       │                      │   │
└───────────────────────────────────────────┘                      │   │
                                                                    │   │
        ┌───────────────────────────────────────────────────────────┘   │
        ▼                                                                │
┌──────────────────────────────────────────────────────────────────┐    │
│                    CriticManager (critic_manager.cpp)             │    │
│  - evalTrajectoriesScores(CriticData)                            │    │
│    → 각 Critic의 score() 순서대로 호출                            │    │
└─────────────────────────┬────────────────────────────────────────┘    │
                          │ pluginlib 로드                                │
                          ▼                                              │
┌─────────────────────────────────────────────────────────────────────┐ │
│              CriticFunction 구현체들 (critics/*.cpp)                 │ │
│                                                                      │ │
│  ConstraintCritic    GoalCritic        PathFollowCritic             │ │
│  CostCritic          GoalAngleCritic   PathAlignCritic              │ │
│  ObstaclesCritic     PathAngleCritic   PreferForwardCritic          │ │
│  TwirlingCritic      VelocityDeadbandCritic                         │ │
│                                                                      │ │
│  공통: score(CriticData&) → data.costs[batch] += 비용 누적          │ │
└─────────────────────────────────────────────────────────────────────┘ │
                                                                         │
        ┌────────────────────────────────────────────────────────────────┘
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  NoiseGenerator (noise_generator.cpp)                 │
│  - noises_vx_, noises_vy_, noises_wz_ [batch_size × time_steps]     │
│  - 선택적 백그라운드 스레드 (noise_thread_)                           │
│  - setNoisedControls() → state.cvx = optimal_control + noise         │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                   MotionModel (motion_models.cpp)                    │
│                  [pluginlib로 로드]                                   │
│                                                                      │
│  DiffDriveMotionModel:  vx, wz만 (vy=0 강제)                        │
│  OmniMotionModel:       vx, vy, wz 독립                             │
│  AckermannMotionModel:  최소 회전반경 강제                            │
│                                                                      │
│  predict(state): 가속도 제약 내에서 배치 속도 업데이트               │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                  데이터 흐름 (Data Flow)                              │
│                                                                      │
│  nav_msgs::Path                                                      │
│      ↓ toTensor()                                                    │
│  models::Path (Eigen::ArrayXf x, y, yaws)                           │
│                                                                      │
│  models::ControlSequence (optimal)                                   │
│      + noises_* (NoiseGenerator)                                     │
│      → state.cvx/cvy/cwz [batch × time_steps]                       │
│          ↓ MotionModel.predict()                                     │
│      → state.vx/vy/wz (실제 달성 가능 속도)                          │
│          ↓ integrateStateVelocities()                                │
│      → Trajectories.x/y/yaws [batch × time_steps]                   │
│          ↓ CriticManager.evalTrajectoriesScores()                    │
│      → costs [batch_size]                                            │
│          ↓ updateControlSequence() (softmax)                         │
│      → ControlSequence (갱신된 최적 제어)                             │
│          ↓ getControlFromSequenceAsTwist()                           │
│      → TwistStamped (최종 속도 명령)                                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 제어 루프 상세 흐름

```
매 컨트롤러 주기마다:

[1] MPPIController::computeVelocityCommands()
    │
    ▼
[2] Optimizer::evalControl(pose, speed, plan, goal, checker)
    │
    ├── [2a] prepare(pose, speed, plan, goal, checker)
    │         ├── 로봇 포즈/속도를 State에 저장
    │         ├── nav_msgs::Path → models::Path (Eigen 텐서) 변환
    │         ├── CriticData 초기화 (fail_flag=false, caches clear)
    │         └── open_loop 모드 시 마지막 명령으로 speed 대체
    │
    ├── [2b] optimize() ← iteration_count회 반복
    │         │
    │         ├── [i] generateNoisedTrajectories()
    │         │        ├── NoiseGenerator::setNoisedControls()
    │         │        │     state.cvx = control_sequence.vx (브로드캐스트)
    │         │        │              + noises_vx_ (배치 노이즈)
    │         │        ├── MotionModel::predict(state)
    │         │        │     가속도 제약으로 v_actual 계산:
    │         │        │     v_next = clamp(v_target, v_curr ± a_max*dt)
    │         │        └── integrateStateVelocities(trajectories, state)
    │         │              x += vx * cos(yaw) * dt - vy * sin(yaw) * dt
    │         │              y += vx * sin(yaw) * dt + vy * cos(yaw) * dt
    │         │              yaw += wz * dt
    │         │
    │         ├── [ii] CriticManager::evalTrajectoriesScores(critics_data_)
    │         │         각 Critic::score(data) 순서대로:
    │         │         data.costs[k] += weight * cost(trajectory[k])^power
    │         │
    │         └── [iii] updateControlSequence()
    │                   β = min(costs)
    │                   w[k] = exp(-(costs[k]-β)/temperature)
    │                   w = w / sum(w)
    │                   control_sequence[t] = sum_k(w[k] * noised_control[k,t])
    │                   → savitskyGolayFilter(control_sequence, sgf_order)
    │                   → applyConstraints(control_sequence)
    │
    ├── [2c] getOptimizedTrajectory()
    │         최적 제어 시퀀스로 단일 궤적 계산 반환
    │
    ├── [2d] TrajectoryValidator::validateTrajectory(optimal_traj, ...)
    │         → SUCCESS: 계속 진행
    │         → SOFT_RESET: reset() 후 [2b]로 재시도
    │         → FAILURE: NoValidControl 예외
    │
    ├── [2e] fallback(fail_flag || !trajectory_valid)
    │         실패 시: reset() 후 전체 루프 재시도
    │         retry_attempt_limit 초과 시: 예외 발생
    │
    └── [2f] getControlFromSequenceAsTwist(stamp)
              control_sequence[0] → TwistStamped 반환
              shift_control_sequence가 true이면 시퀀스 1스텝 앞으로 시프트
```

---

## 주요 파라미터 정리

### Optimizer 파라미터

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `model_dt` | 0.05 | 운동 모델 시뮬레이션 타임스텝 (초). controller_frequency와 같아야 함 |
| `time_steps` | 56 | 예측 수평선(horizon) 길이 (스텝 수). `model_dt × time_steps = 예측 시간` |
| `batch_size` | 1000 | 매 반복마다 샘플링할 후보 궤적 수. 클수록 성능↑, 계산량↑ |
| `iteration_count` | 1 | MPPI 반복 횟수. 클수록 수렴 품질↑, 계산량↑ |
| `temperature` | 0.3 | 소프트맥스 온도. 낮을수록 최저비용 궤적에 집중 |
| `gamma` | 0.015 | 제어 크기 정규화 항 (정보이론적 탐색-이용 균형) |
| `vx_max` | 0.5 | 최대 전진 속도 (m/s) |
| `vx_min` | -0.35 | 최대 후진 속도 (m/s, 음수) |
| `vy_max` | 0.5 | 최대 횡방향 속도 (홀로노믹만, m/s) |
| `wz_max` | 1.9 | 최대 각속도 (rad/s) |
| `ax_max` / `ax_min` | 3.0 / -3.0 | 전진/후진 최대 가속도 (m/s²) |
| `ay_max` / `ay_min` | 3.0 / -3.0 | 횡방향 최대 가속도 (m/s²) |
| `az_max` | 3.5 | 최대 각가속도 (rad/s²) |
| `vx_std` | 0.2 | 전진 속도 노이즈 표준편차 |
| `vy_std` | 0.2 | 횡방향 속도 노이즈 표준편차 |
| `wz_std` | 0.4 | 각속도 노이즈 표준편차 |
| `motion_model` | "diff_drive" | 운동 모델 ("diff_drive" / "omni" / "ackermann") |
| `retry_attempt_limit` | 1 | 실패 시 재시도 횟수 |
| `open_loop` | false | true면 현재 속도 대신 마지막 명령 속도 사용 |
| `sgf_order` | 2 | Savitzky-Golay 필터 차수 (1 또는 2) |

---

## 커스텀 컨트롤러 패키지 개발 방향 추천

nav2_mppi_controller는 pluginlib 기반 확장 포인트 세 곳을 제공한다. 아래에서는 각 방향의 구체적인 구현 방법과 활용 시나리오를 설명한다.

### 방향 1: 커스텀 Critic 개발 (가장 추천)

**언제 사용하나**: 기존 Critic 조합으로 원하는 주행 특성을 만들 수 없을 때. 예) 특정 구역 회피, 사람 추적, 에너지 효율 최적화.

**구현 방법**:

```cpp
// my_custom_critic.hpp
#include "nav2_mppi_controller/critic_function.hpp"
#include "nav2_mppi_controller/critic_data.hpp"

namespace my_pkg::critics
{
class MyCustomCritic : public mppi::critics::CriticFunction
{
public:
  void initialize() override
  {
    // 파라미터 로드
    auto getParam = parameters_handler_->getParamGetter(name_);
    getParam(weight_, "cost_weight", 1.0f);
    getParam(power_, "cost_power", 1u);
    getParam(my_param_, "my_param", 1.0f);
    enabled_ = true;
  }

  void score(mppi::CriticData & data) override
  {
    if (!enabled_) return;

    // data.trajectories.x/y/yaws: [batch_size × time_steps] Eigen 배열
    // data.costs: [batch_size] 누적 비용
    // data.path: 참조 경로
    // data.state: 현재 로봇 상태

    // 예시: 특정 구역에 근접한 궤적에 페널티
    for (size_t i = 0; i < data.trajectories.x.rows(); ++i) {
      float dist_to_zone = computeDistanceToZone(
        data.trajectories.x.row(i), data.trajectories.y.row(i));
      data.costs(i) += weight_ * std::pow(std::max(0.0f, zone_radius_ - dist_to_zone), power_);
    }
  }

private:
  float my_param_{1.0f};
  float zone_radius_{2.0f};
};
}

PLUGINLIB_EXPORT_CLASS(my_pkg::critics::MyCustomCritic, mppi::critics::CriticFunction)
```

**critics.xml 등록**:

```xml
<library path="my_pkg">
  <class type="my_pkg::critics::MyCustomCritic"
         base_class_type="mppi::critics::CriticFunction">
    <description>Custom zone avoidance critic</description>
  </class>
</library>
```

**파라미터 설정**:

```yaml
controller_server:
  ros__parameters:
    FollowPath:
      critics:
        - "my_pkg::critics::MyCustomCritic"
        - "mppi::critics::GoalCritic"
        # ... 기존 Critic들
      MyCustomCritic:
        cost_weight: 5.0
        cost_power: 2
        my_param: 3.0
```

**활용 시나리오**:

- **사람 근접 회피**: 사람 감지 결과를 구독, Critic에서 사람 위치 기반 반발력 비용 추가
- **에너지 효율**: `sum(vx² + vy² + wz²)` 최소화 비용으로 에너지 절약 주행
- **도로 레인 추종**: 차선 중앙으로부터의 이탈 거리 비용 추가
- **가속도 최소화**: 승차감 향상을 위한 가속도 변화율(jerk) 페널티

### 방향 2: 커스텀 MotionModel 개발

**언제 사용하나**: 기본 3종 모델이 로봇 운동학을 정확히 표현하지 못할 때. 예) 트레일러 달린 로봇, 4WS(4-wheel steering), 6족 보행 로봇.

**구현 방법**:

```cpp
#include "nav2_mppi_controller/motion_models.hpp"

namespace my_pkg
{
class TrailerMotionModel : public mppi::MotionModel
{
public:
  bool isHolonomic() const override { return false; }

  void applyConstraints(mppi::models::State & state) override
  {
    // 트레일러 연결각(hitch_angle) 기반 vx, wz 제약
    auto & vx = state.vx;
    auto & wz = state.wz;
    float hitch_limit = max_hitch_angle_;
    // wz 제약: 트레일러 각도 한계 이내로 클램핑
    wz = wz.min(vx.abs() / (trailer_length_ * std::tan(hitch_limit)));
  }

private:
  float trailer_length_{1.5f};
  float max_hitch_angle_{0.5f};
};
}

PLUGINLIB_EXPORT_CLASS(my_pkg::TrailerMotionModel, mppi::MotionModel)
```

**활용 시나리오**:

- **자율 농기계**: 트레일러/작업기 연결 운동학
- **4WS 로봇**: 4개 바퀴 독립 조향 모델
- **항공기 예인 트랙터**: 복잡한 관절 운동학

### 방향 3: 커스텀 TrajectoryValidator 개발

**언제 사용하나**: 기본 코스트맵 기반 충돌 검사 이외의 추가 유효성 검증이 필요할 때. 예) 동적 장애물, 시맨틱 레이블, 속도 프로파일 검증.

**구현 방법**:

```cpp
#include "nav2_mppi_controller/optimal_trajectory_validator.hpp"

namespace my_pkg
{
class SemanticTrajectoryValidator : public mppi::OptimalTrajectoryValidator
{
public:
  mppi::ValidationResult validateTrajectory(
    const Eigen::ArrayXXf & optimal_traj,
    const mppi::models::ControlSequence & control_seq,
    const geometry_msgs::msg::PoseStamped & pose,
    const geometry_msgs::msg::Twist & speed,
    const nav_msgs::msg::Path & plan,
    const geometry_msgs::msg::Pose & goal) override
  {
    // 1. 부모 클래스 충돌 검사
    auto base_result = DefaultOptimalTrajectoryValidator::validateTrajectory(
      optimal_traj, control_seq, pose, speed, plan, goal);
    if (base_result != mppi::ValidationResult::SUCCESS) return base_result;

    // 2. 추가: 시맨틱 레이블 검사 (예: 금지 구역 진입 여부)
    for (int t = 0; t < optimal_traj.cols(); ++t) {
      if (isInForbiddenZone(optimal_traj(0, t), optimal_traj(1, t))) {
        return mppi::ValidationResult::SOFT_RESET;
      }
    }
    return mppi::ValidationResult::SUCCESS;
  }
};
}
```

### 방향 4: 완전 커스텀 MPPI 기반 컨트롤러

기존 패키지를 참고하여 새로운 특성을 가진 컨트롤러를 처음부터 설계:

#### 4-1. 멀티-에이전트 인식 MPPI

```
목적: 다른 로봇들의 예측 궤적을 고려한 충돌 회피

핵심 변경:
- 각 로봇의 예측 궤적을 구독
- SocialCostCritic: 다른 로봇 궤적과의 간섭 비용
- 분산 MPPI로 확장 (DMPC-MPPI)
```

#### 4-2. 학습 기반 비용함수 MPPI

```
목적: 신경망으로 학습된 비용함수 사용

핵심 변경:
- NeuralCritic: ONNX/TorchScript 모델을 Critic으로 래핑
- 비용함수를 모방학습(imitation learning)으로 학습
- critic_data의 trajectories 텐서를 직접 NN 입력으로 사용
```

#### 4-3. 계층적 MPPI (Hierarchical MPPI)

```
목적: 장기 계획 + 단기 반응의 계층 구조

핵심 변경:
- 상위 레이어: 큰 model_dt, 작은 batch_size, 긴 horizon → 글로벌 방향
- 하위 레이어: 작은 model_dt, 큰 batch_size, 짧은 horizon → 장애물 반응
- 상위 출력을 하위의 PathFollowCritic 참조 경로로 사용
```

#### 4-4. 에너지 최적화 MPPI (모바일 플랫폼)

```
목적: 배터리 수명 최대화

핵심 변경:
- EnergyCritic: 모터 전류/토크 모델 기반 에너지 비용
- 가속도 페널티 강화로 관성 활용 극대화
- 내리막 구간에서 회생제동 보상 비용
```

### 커스텀 개발 시 핵심 고려사항

#### Eigen 배열 활용 패턴

모든 비용 계산은 배치 행렬 연산으로 구현해야 성능을 유지한다:

```cpp
// 나쁜 예: for 루프
for (int k = 0; k < batch_size; ++k) {
  for (int t = 0; t < time_steps; ++t) {
    cost += computeCost(data.trajectories.x(k,t), data.trajectories.y(k,t));
  }
}

// 좋은 예: Eigen 벡터화 연산
Eigen::ArrayXXf dists = (data.trajectories.x - goal_x).square() +
                         (data.trajectories.y - goal_y).square();
data.costs += weight_ * dists.rowwise().sum().sqrt();
```

#### CriticData 캐시 활용

반복 계산이 많은 `furthest_reached_path_point`는 `std::optional` 캐시를 활용:

```cpp
// 첫 번째 Critic이 계산하면 이후 Critic은 캐시 사용
utils::setPathFurthestPointIfNotSet(data);
auto furthest_idx = data.furthest_reached_path_point.value();
```

#### 스레드 안전성

`ParametersHandler`의 뮤텍스를 활용하여 동적 파라미터 변경 시 안전하게 처리:

```cpp
void initialize() override {
  auto getParam = parameters_handler_->getParamGetter(name_);
  // addPreCallback으로 유효성 검증 추가 가능
  parameters_handler_->addPreCallback(name_ + ".my_param",
    [](const rclcpp::Parameter & p, auto & result) {
      if (p.as_double() < 0.0) {
        result.successful = false;
        result.reason = "my_param must be non-negative";
      }
    });
}
```

---

!!! note "출처"
    이 문서는 `nav2_mppi_controller` 패키지 (Nav2 Jazzy/Rolling 기준) 소스코드 분석을 기반으로 작성되었습니다.
