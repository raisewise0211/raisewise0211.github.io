# 커스텀 노드 개발

    - **핵심 목표**: SyncActionNode(동기) vs StatefulActionNode(비동기)의 차이, halt() 처리, C++로 실제 커스텀 노드 작성
    - **참고 자료**: [behaviortree.dev - Tutorial 04: Reactive Behaviors](https://www.behaviortree.dev/docs/tutorial-basics/tutorial_04_reactive), BehaviorTree.CPP GitHub examples
    - **수학/수식**: 이번 세션에는 없음

---

## 한 줄 요약

> Action이 한 Tick 안에 즉시 끝나면 SyncActionNode, 여러 Tick에 걸쳐 진행되며 중간에 취소될 수도 있으면 StatefulActionNode를 쓴다.

---

## 원인과 결과: 왜 두 종류의 Action 클래스가 필요한가

세션 2에서 "RUNNING은 아직 안 끝났다는 뜻"이라고 배웠다. 그런데 실제로 코드를 짤 때는 이게 생각보다 까다롭다.

**원인**: "문 열기"처럼 즉시 판단이 끝나는 작업과, "5미터 이동하기"처럼 몇 초에 걸쳐 진행되는 작업은
코드 구조가 근본적으로 다르다. 후자는 "지금 시작", "진행 중 확인", "중간에 취소당했을 때 정리"라는
**3가지 서로 다른 시점의 코드**가 필요하다. 이걸 구분 없이 하나의 함수(tick)에 다 몰아넣으면,
"지금 막 시작한 건지, 이미 진행 중이던 건지"를 매번 직접 변수로 추적해야 해서 버그가 나기 쉽다.

**결과**: BehaviorTree.CPP는 이 두 경우를 위한 **서로 다른 베이스 클래스**를 제공한다.

| 클래스 | 언제 쓰는가 | 특징 |
|--------|-------------|------|
| **SyncActionNode** | 한 Tick 안에 즉시 SUCCESS/FAILURE가 결정되는 작업 | `tick()` 함수 하나만 구현하면 끝, RUNNING을 반환하지 않음 |
| **StatefulActionNode** | 여러 Tick에 걸쳐 진행되고, 중간에 취소(halt)될 수 있는 작업 | `onStart()`, `onRunning()`, `onHalted()` 3개 함수를 나눠서 구현 |

---

## SyncActionNode 예시 — 즉시 끝나는 작업

```cpp
class CheckBattery : public BT::SyncActionNode
{
public:
    CheckBattery(const std::string& name, const BT::NodeConfig& config)
        : BT::SyncActionNode(name, config) {}

    static BT::PortsList providedPorts()
    {
        return { BT::OutputPort<double>("battery_level") };
    }

    BT::NodeStatus tick() override
    {
        double level = readBatteryFromSensor();  // 즉시 값을 읽어옴
        setOutput("battery_level", level);
        return (level > 0.2) ? BT::NodeStatus::SUCCESS
                              : BT::NodeStatus::FAILURE;
    }
};
```

이 노드는 절대 RUNNING을 반환하지 않는다. `tick()`이 호출되면 그 즉시 SUCCESS/FAILURE 둘 중 하나로 끝난다.

---

## StatefulActionNode 예시 — 시간이 걸리는 작업

**원인**: "5미터 이동하기"를 SyncActionNode로 짜면, 이동이 끝날 때까지 `tick()` 함수 안에서 빠져나오지 못하고
계속 대기해야 한다. 이러면 그동안 트리의 다른 부분(예: 안전 감시)이 전혀 틱되지 못한다 — 로봇 전체가 멈춰버린다.

**결과**: StatefulActionNode는 "시작할 때 한 번", "매 Tick마다 진행 상황만 확인", "중간에 취소당하면 정리"를
서로 다른 함수로 명확히 나눠서, `tick()` 함수 안에서 오래 머무르지 않고 즉시 리턴하게 만든다.

```cpp
class MoveToGoal : public BT::StatefulActionNode
{
public:
    MoveToGoal(const std::string& name, const BT::NodeConfig& config)
        : BT::StatefulActionNode(name, config) {}

    static BT::PortsList providedPorts()
    {
        return { BT::InputPort<Pose>("goal") };
    }

    // 1) 맨 처음 한 번만 호출됨 — "이동 시작" 명령만 보내고 즉시 리턴
    BT::NodeStatus onStart() override
    {
        Pose goal;
        getInput("goal", goal);
        sendMoveCommand(goal);        // 비동기로 이동 명령만 전송
        return BT::NodeStatus::RUNNING;
    }

    // 2) RUNNING인 동안 매 Tick마다 호출됨 — "진행 상황만" 확인
    BT::NodeStatus onRunning() override
    {
        if (isGoalReached())  return BT::NodeStatus::SUCCESS;
        if (isPathBlocked())  return BT::NodeStatus::FAILURE;
        return BT::NodeStatus::RUNNING;   // 아직 진행 중
    }

    // 3) 다른 가지가 우선순위를 뺏어가서 중간에 취소될 때 호출됨
    void onHalted() override
    {
        stopRobotImmediately();       // 뒷정리: 로봇을 안전하게 멈춤
    }
};
```

---

## Tick 흐름과 세 함수의 호출 시점

```
             [처음 이 노드가 Tick됨]
                      │
                      ▼
                 onStart() 호출
              (이동 명령만 보내고 RUNNING 반환, 즉시 빠져나옴)
                      │
                      ▼
        ┌──── 다음 Tick마다 반복 ────┐
        │                            │
        ▼                            │
   onRunning() 호출 ──RUNNING이면──▶ (계속 반복, 트리는 멈추지 않음)
        │
   SUCCESS/FAILURE면
        │
        ▼
   해당 상태를 부모에게 전달, 이 노드는 다시 Tick되면 onStart()부터 시작

  ※ 만약 진행 도중 ReactiveFallback 등에 의해 더 급한 가지로 전환되면:
        ▼
   onHalted() 호출 (안전하게 정지/뒷정리)
```

**왜 `onHalted()`가 중요한가**: 세션 6에서 배운 ReactiveFallback을 떠올려보자. "사람 감지"가 갑자기 SUCCESS가 되면,
그동안 RUNNING 상태였던 "순찰 이동" 가지는 강제로 중단(halt)된다. 이때 로봇이 물리적으로 계속 움직이고 있었다면,
`onHalted()`에서 반드시 정지 명령을 보내야 한다. 이 함수를 빼먹으면 트리 상에서는 "취소"됐지만 실제 로봇은
계속 움직이는 **위험한 불일치**가 생긴다.

---

## 핵심 개념 정리

!!! tip "이 세션의 핵심 3가지"
    1. **즉시 끝나면 SyncActionNode, 여러 Tick에 걸치면 StatefulActionNode** — 작업의 시간적 성격에 따라 베이스 클래스를 선택한다.
    2. **StatefulActionNode는 onStart/onRunning/onHalted 세 함수로 시점을 명확히 분리**한다 — `tick()` 안에서 오래 대기하지 않아야 트리 전체가 멈추지 않는다.
    3. **onHalted()를 반드시 구현해야 한다** — 다른 가지에 우선순위를 뺏겨 중단될 때, 실제 로봇 동작도 안전하게 함께 정지시켜야 한다.

---

## 복습 (15분)

### 분류하기

다음 작업들을 SyncActionNode / StatefulActionNode로 분류해보세요: (1) LED 색깔 확인, (2) 로봇팔로 물건 들어올리기(3초 소요), (3) 배터리 퍼센트 읽기, (4) 목적지까지 경로 따라 이동

??? success "정답"
    - **SyncActionNode**: (1) LED 색깔 확인, (3) 배터리 퍼센트 읽기 — 즉시 값을 읽고 끝남
    - **StatefulActionNode**: (2) 로봇팔로 물건 들어올리기, (4) 목적지까지 이동 — 여러 Tick에 걸쳐 진행되고 중간 취소 가능성이 있음

### 퀴즈

!!! question "Q1"
    `onStart()` 안에서 이동이 끝날 때까지 기다렸다가 SUCCESS를 반환하도록 짜면 어떤 문제가 생기는가?

??? success "정답"
    `tick()` 계열 함수 안에서 오래 머무르게 되어 트리 전체의 Tick 흐름이 멈춘다. 그동안 안전 감시 같은 다른 가지도
    전혀 틱되지 못해, StatefulActionNode를 쓰는 근본 목적(비차단적 진행)이 무의미해진다.

!!! question "Q2"
    `onHalted()`를 구현하지 않으면 실무에서 어떤 위험한 상황이 생길 수 있는가?

??? success "정답"
    트리 상에서는 그 가지가 취소됐다고 표시되지만, 실제 로봇에게는 정지 명령이 전달되지 않아 로봇이 계속 움직이는
    "트리 상태와 실제 로봇 상태의 불일치"가 발생할 수 있다. 예를 들어 사람이 감지돼 순찰을 취소했는데도 로봇이 계속 전진하는 상황.

!!! question "Q3"
    SyncActionNode와 StatefulActionNode 중 어느 쪽이 RUNNING을 반환할 수 있는가?

??? success "정답"
    StatefulActionNode만 RUNNING을 반환할 수 있다(정확히는 onStart/onRunning에서). SyncActionNode의 tick()은
    설계상 그 즉시 SUCCESS 또는 FAILURE로 끝나야 한다.

---

## 다음 세션 예고

**세션 9: ROS2 실전 통합**

- Nav2 BT Navigator의 구조와 실전 디자인 패턴/안티패턴
- Groot2로 실행 중인 로봇을 실시간 디버깅하기

[다음 세션 → 세션 9 · ROS2 실전 통합](session-09-ros2-integration.md){ .md-button .md-button--primary }
