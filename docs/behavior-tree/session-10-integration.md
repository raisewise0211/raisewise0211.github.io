# 종합 실습 & 통합

    - **핵심 목표**: 배운 개념을 총동원해 로봇 순찰 시나리오를 처음부터 직접 설계하고, 전체 9개 세션을 하나의 지도로 복습
    - **참고 자료**: 세션 1~9 전체
    - **수학/수식**: 세션 5(재시도 시간), 세션 6(Parallel 임계값) 복습

---

## 한 줄 요약

> 지금까지 배운 것은 결국 "우선순위 트리(세션1) + 4대 노드(세션2) + 데이터 공유(세션3) + XML/툴체인(세션4) + 정책 가공(세션5) + 실시간 반응(세션6) + 모듈화(세션7) + 실제 구현(세션8) + 실전 적용(세션9)"이 전부 하나로 맞물려 동작하는 시스템이다.

---

## 전체 개념 지도

```
                         [세션1] 왜 BT인가?
                    FSM의 전이 폭발 → 우선순위 트리로 해결
                                 │
                                 ▼
                     [세션2] 4대 노드 + Tick 전파
              Control(뼈대) / Decorator(가공) / Action·Condition(실행)
                    SUCCESS · FAILURE · RUNNING
                                 │
                 ┌───────────────┼───────────────┐
                 ▼               ▼               ▼
        [세션3] Blackboard    [세션5] Decorator   [세션6] Reactive
        데이터 공유·Port      Retry/Timeout 등    실시간 재확인
                 │               │               │
                 └───────────────┼───────────────┘
                                 ▼
                    [세션4] XML + Factory + Groot2
                    구조와 구현 분리, 시각화·모니터링
                                 │
                                 ▼
                       [세션7] Subtree 모듈화
                    거대한 트리를 임무 단위로 분할
                                 │
                                 ▼
                    [세션8] 커스텀 노드 (Sync/Stateful)
                    실제 C++ 코드로 로봇 동작 구현
                                 │
                                 ▼
                     [세션9] ROS2 Nav2 실전 통합
              RecoveryNode, 안티패턴 회피, Groot2 실전 디버깅
```

---

## 종합 실습: 로봇 순찰 시나리오 처음부터 설계하기

**요구사항**: 실내 순찰 로봇을 만든다.

1. 평소에는 정해진 경로를 순찰한다.
2. 사람을 발견하면 순찰을 멈추고 정지한다 (최우선순위, 실시간 반응 필요).
3. 배터리가 20% 이하면 충전소로 이동한다. 충전소 도킹은 최대 3번까지 재시도하되, 한 번의 시도는 5초를 넘기지 않는다.
4. 순찰 중에는 "카메라 감시"와 "이동"을 동시에 수행해야 한다.

### 1단계 — 최상위 우선순위 구조 잡기 (세션 1, 6)

가장 급한 것부터 왼쪽에 배치하는 ReactiveFallback을 쓴다. 사람 발견은 실시간으로 감지해야 하므로 Reactive가 필수다.

```xml
<ReactiveFallback name="Root">
    <SubTree ID="사람대응" />
    <SubTree ID="배터리관리" />
    <SubTree ID="순찰"       />
</ReactiveFallback>
```

### 2단계 — 각 임무를 Subtree로 분리 (세션 7)

```xml
<BehaviorTree ID="사람대응">
    <Sequence>
        <Condition ID="IsPersonDetected" />
        <Action    ID="StopRobot" />
    </Sequence>
</BehaviorTree>
```

### 3단계 — 배터리 관리에 Decorator 조합 적용 (세션 5)

"3번까지 재시도, 한 번에 5초 제한"이라는 요구사항을 그대로 Decorator 두 개로 표현한다.
최악의 경우 소요시간 = 5초 × 3 = **15초**로 미리 계산해둔다.

```xml
<BehaviorTree ID="배터리관리">
    <Sequence>
        <Condition ID="IsBatteryLow" />
        <Retry num_attempts="3">
            <Timeout msec="5000">
                <Action ID="DockToChargingStation" />
            </Timeout>
        </Retry>
    </Sequence>
</BehaviorTree>
```

### 4단계 — 순찰 중 동시 작업은 Parallel로 (세션 6)

카메라 감시와 이동을 동시에 수행하되, 이동 하나만 성공해도 이번 순찰 구간은 성공으로 친다.

```xml
<BehaviorTree ID="순찰">
    <Parallel success_count="1" failure_count="1">
        <Action ID="CameraMonitoring" />
        <Action ID="MoveToNextWaypoint" />
    </Parallel>
</BehaviorTree>
```

### 5단계 — 데이터 흐름 연결 (세션 3)

`MoveToNextWaypoint`가 계산한 다음 목표 좌표를 Blackboard를 통해 다음 순찰 사이클에 전달한다.

```xml
<Action ID="ComputeNextWaypoint" waypoint="{next_wp}" />
<Action ID="MoveToNextWaypoint"  goal="{next_wp}" />
```

### 6단계 — 실제 구현 (세션 8)

`MoveToNextWaypoint`는 여러 Tick에 걸쳐 진행되고 사람 발견 시 취소될 수 있으므로 **StatefulActionNode**로,
`IsPersonDetected`는 즉시 참/거짓만 확인하므로 **SyncActionNode(Condition)**로 구현한다. `onHalted()`에서
반드시 로봇 정지 명령을 보낸다 (세션 9 안티패턴 회피).

### 완성된 전체 트리 조감도

```
ReactiveFallback (Root)               ← 매 Tick마다 왼쪽부터 재확인
 ├── 사람대응 (Sequence)               ← 최우선
 │    ├── IsPersonDetected
 │    └── StopRobot
 ├── 배터리관리 (Sequence)
 │    ├── IsBatteryLow
 │    └── Retry(3) → Timeout(5s) → DockToChargingStation
 └── 순찰 (Parallel, success=1, failure=1)
      ├── CameraMonitoring
      └── ComputeNextWaypoint → MoveToNextWaypoint (goal={next_wp})
```

---

## 최종 정리

!!! tip "20시간 학습의 핵심 30%"
    1. **우선순위 트리 + Tick 전파** (세션1~2) — BT의 존재 이유와 동작 방식의 뼈대
    2. **Blackboard/Ports + XML/Factory** (세션3~4) — 데이터 흐름과 구조-구현 분리
    3. **Decorator + Reactive 실행모델** (세션5~6) — 정책 조절과 실시간 안전성
    4. **Subtree 모듈화 + 커스텀 노드 구현** (세션7~8) — 실제로 크고 유지보수 가능한 트리를 만드는 방법
    5. **ROS2 실전 통합** (세션9) — 지금까지 배운 모든 것이 Nav2 안에서 그대로 응용된다는 확인

---

## 최종 복습 (15분)

### 종합 다이어그램 그리기

위 6단계 실습에서 만든 전체 트리 조감도를 백지에 처음부터 다시 그려보세요. 특히 각 노드가 Control/Decorator/Action/Condition
중 무엇인지 표시해보세요.

??? success "정답 힌트"
    - ReactiveFallback, Sequence, Parallel → **Control 노드**
    - Retry, Timeout → **Decorator 노드**
    - IsPersonDetected, IsBatteryLow → **Condition 노드**
    - StopRobot, DockToChargingStation, CameraMonitoring, MoveToNextWaypoint → **Action 노드**

### 최종 퀴즈

!!! question "Q1"
    이 시나리오에서 Root를 Fallback이 아니라 ReactiveFallback으로 만든 이유는?

??? success "정답"
    사람 감지처럼 실시간으로 바뀌는 조건은, 이미 순찰이나 배터리 관리 가지가 RUNNING으로 진행 중이더라도
    매 Tick마다 다시 확인해서 즉시 우선순위를 뺏어야 하기 때문이다(세션 6). 일반 Fallback이면 이미 RUNNING인
    가지를 계속 이어가고 사람 감지를 재확인하지 않는다.

!!! question "Q2"
    배터리 관리 로직에서 `Retry(3) + Timeout(5초)`의 최악의 소요시간은 몇 초이며, 왜 이 계산이 실무에서 중요한가?

??? success "정답"
    15초(5초 × 3). 상위 설계에서 "이 임무 전체를 몇 초 안에 끝내야 하는지" 예산을 잡을 때, 하위 가지 하나가
    최악의 경우 얼마나 시간을 쓸 수 있는지 미리 알아야 전체 일정과 충돌하지 않는지 확인할 수 있기 때문이다(세션 5).

!!! question "Q3"
    `MoveToNextWaypoint`를 SyncActionNode가 아니라 StatefulActionNode로 구현해야 하는 이유와, `onHalted()`를
    반드시 구현해야 하는 이유를 각각 설명하라.

??? success "정답"
    이동은 여러 Tick에 걸쳐 진행되므로(세션 8) StatefulActionNode가 필요하다. 또한 사람이 감지되어 ReactiveFallback이
    다른 가지로 전환되면 이동 중이던 이 노드가 강제로 halt되는데, `onHalted()`가 없으면 트리 상으로는 취소됐지만
    실제 로봇은 계속 움직이는 위험한 불일치가 생기기 때문에 반드시 로봇 정지 명령을 여기서 처리해야 한다(세션 9).

---

## 수고하셨습니다

10개 세션, 20시간의 학습을 마쳤다. 이제 [behaviortree.dev](https://www.behaviortree.dev/) 공식 튜토리얼의 t01~t16을
직접 코드로 따라 치며 손에 익히고, 실제 ROS2 Nav2의 `nav2_bt_navigator` 기본 XML 파일을 열어 이번에 배운 개념들이
어떻게 적용되어 있는지 하나씩 대조해보는 것을 추천한다.

[처음으로 돌아가기 → Behavior Tree 개요](index.md){ .md-button }
