# 4대 노드 타입과 Tick 전파

    - **핵심 목표**: Control/Decorator/Action/Condition 4가지 노드 타입과 SUCCESS·FAILURE·RUNNING 상태 전파 원리 이해
    - **참고 자료**: [behaviortree.dev - Main Concepts](https://www.behaviortree.dev/docs/3.8/learn-the-basics/main_concepts/)
    - **수학/수식**: 이번 세션에는 없음 (단순 논리 규칙만 사용)

---

## 한 줄 요약

> Behavior Tree의 모든 복잡한 행동은 딱 4가지 노드 타입(Control, Decorator, Action, Condition)의 조합으로 만들어지고, 각 노드는 Tick을 받으면 SUCCESS·FAILURE·RUNNING 셋 중 하나를 반환한다.

---

## 원인과 결과: 왜 노드 타입을 4가지로 나눴는가

세션 1에서 "BT는 우선순위 트리"라고 했다. 그런데 트리의 가지마다 다른 규칙(순서대로 다 해봐라 / 하나라도 되면 끝 / 동시에 해봐라)이
필요하다는 문제가 생긴다. 이걸 전부 하나의 노드 타입으로 만들면 노드 안에 if문이 산더미처럼 쌓여서 다시 스파게티가 된다.

**원인**: "여러 자식을 어떤 순서/규칙으로 실행할지"와 "실제로 무엇을 할지"는 서로 다른 종류의 결정이다.
전자는 트리의 구조(뼈대)에 대한 것이고, 후자는 로봇이 실제로 수행하는 작업(살)에 대한 것이다. 이 둘을 한 노드에
섞으면 재사용이 불가능해진다.

**결과**: BehaviorTree.CPP를 비롯한 대부분의 BT 라이브러리는 노드를 역할에 따라 딱 4종류로 표준화했다.
이렇게 표준화하면 "Sequence"라는 뼈대 노드 하나로 어떤 상황에서든 "순서대로 실행"이라는 동일한 로직을 재사용할 수 있다.

| 노드 타입 | 역할 | 자식 개수 | 실생활 비유 |
|-----------|------|-----------|-------------|
| **Control (제어)** | 자식들을 "어떤 순서/규칙"으로 틱할지 결정 | 여러 개 | 팀장이 업무 순서를 정하는 것 |
| **Decorator (수식자)** | 자식 하나의 결과를 가공하거나 실행 방식을 바꿈 | 딱 1개 | 필터/조건을 다는 것 (예: "3번까지만 재시도") |
| **Action (행동)** | 실제로 무언가를 수행하는 말단(Leaf) 노드 | 0개 (말단) | 실제로 손발을 움직이는 사람 |
| **Condition (조건)** | 참/거짓만 즉시 확인하는 말단 노드 | 0개 (말단) | "지금 문이 열려있나?"를 확인만 하는 사람 |

---

## 대표적인 Control 노드 둘: Sequence와 Fallback

Control 노드 중에서도 실무에서 90% 이상 쓰이는 것은 딱 두 가지다.

### Sequence (순차 실행) — "AND"

자식을 왼쪽부터 순서대로 틱한다. **자식 하나라도 FAILURE면 즉시 멈추고 FAILURE를 반환**한다.
모든 자식이 SUCCESS여야 Sequence도 SUCCESS를 반환한다. "문을 열고 → 방에 들어가고 → 문을 닫는다"처럼
전부 성공해야 의미가 있는 작업에 쓴다.

```
Sequence("청소하기")
 ├── Condition: 배터리 충분한가?   → SUCCESS
 ├── Action: 청소 구역으로 이동     → SUCCESS
 └── Action: 바닥 청소 시작        → RUNNING (아직 진행 중)

결과: Sequence 전체 상태 = RUNNING (마지막 자식이 RUNNING이므로)
```

### Fallback (대체 실행, 다른 라이브러리에선 "Selector"라고도 함) — "OR"

자식을 왼쪽부터 순서대로 틱한다. **자식 하나라도 SUCCESS면 즉시 멈추고 SUCCESS를 반환**한다.
모든 자식이 FAILURE여야 Fallback도 FAILURE를 반환한다. "제일 우선순위 높은 방법부터 시도해보고,
안 되면 차선책"이라는 논리에 쓴다.

```
Fallback("사람에게 대응하기")
 ├── Condition: 사람이 앞에 있는가?     → FAILURE (없음)
 ├── Condition: 장애물이 있는가?        → SUCCESS (장애물 회피 로직으로 진입)
 └── Action: 평소처럼 이동             → (틱되지 않음, 이미 위에서 SUCCESS)

결과: Fallback 전체 상태 = SUCCESS
```

---

## SUCCESS / FAILURE / RUNNING — 왜 3가지 상태가 필요한가

**원인**: 로봇의 행동 중에는 "문을 여는 중"처럼 한 Tick 안에 끝나지 않고 여러 Tick에 걸쳐 진행되는 것이 많다.
만약 상태가 SUCCESS/FAILURE 둘 뿐이라면, "아직 하는 중이야"라는 정보를 표현할 방법이 없다.

**결과**: BT는 세 번째 상태 **RUNNING**을 도입했다. "아직 안 끝났으니 다음 Tick에 나를 다시 불러줘"라는 의미다.
이 덕분에 이동, 회전처럼 시간이 걸리는 작업도 자연스럽게 트리 안에 표현할 수 있다.

```
Action 노드 "목표지점으로이동" 이 여러 Tick에 걸쳐 실행되는 흐름

Tick 1: 이동시작 명령 전송        → RUNNING 반환
Tick 2: 아직 이동 중 (거리 남음)   → RUNNING 반환
Tick 3: 아직 이동 중 (거리 남음)   → RUNNING 반환
Tick 4: 목표 지점 도착             → SUCCESS 반환
```

---

## Tick이 트리를 타고 전파되는 전체 흐름

```
                  [Root Tick 신호]
                        │
                        ▼
              ┌── Sequence("메인로직") ──┐
              │                          │
              ▼                          ▼
      Condition("배터리OK?")     Fallback("이동방식결정")
              │                          │
        SUCCESS 반환                ┌────┴────┐
              │                     ▼         ▼
              │              Condition    Action
              │             ("경로있음?") ("직진이동")
              │                  │            │
              │             FAILURE 반환  RUNNING 반환
              │                  │            │
              │                  └──Fallback은 다음 자식으로──┘
              │                       Fallback 전체 = RUNNING
              ▼
   Sequence 전체 상태 = RUNNING (자식 중 하나가 RUNNING)
              │
              ▼
        Root가 RUNNING 받음 → 다음 Tick에 다시 반복
```

이 그림에서 핵심은: **각 노드는 자기 자식의 결과만 보고 자기 상태를 결정하고, 그 결과를 부모에게 그대로 전달**한다는 것이다.
Root는 이 결과가 트리 끝까지 올라온 것을 보고, RUNNING이면 다음 Tick에 똑같은 절차를 반복한다.

---

## 핵심 개념 정리

!!! tip "이 세션의 핵심 3가지"
    1. **4대 노드 = Control(뼈대) + Decorator(가공) + Action/Condition(실제 작업)** — 뼈대와 작업 내용을 분리한 것이 핵심.
    2. **Sequence = AND(하나라도 실패하면 전체 실패), Fallback = OR(하나라도 성공하면 전체 성공)** — 이 두 개만 알아도 실무 BT의 대부분을 읽고 쓸 수 있다.
    3. **RUNNING은 "아직 안 끝났다"는 의미** — 시간이 걸리는 작업을 여러 Tick에 걸쳐 자연스럽게 표현하게 해준다.

---

## 복습 (15분)

### 다이어그램 완성하기

아래 Sequence의 최종 반환값을 채워보세요. (규칙: 하나라도 FAILURE면 즉시 FAILURE, 전부 SUCCESS여야 SUCCESS)

```
Sequence
 ├── Condition A → SUCCESS
 ├── Action B    → SUCCESS
 └── Action C    → FAILURE

Sequence 전체 결과 = ___________
```

??? success "정답"
    **FAILURE**. C가 FAILURE이므로 Sequence는 그 즉시 멈추고 FAILURE를 반환한다. (뒤에 자식이 더 있어도 틱하지 않는다)

### 퀴즈

!!! question "Q1"
    Control 노드와 Action 노드의 근본적인 차이는 무엇인가?

??? success "정답"
    Control 노드는 자식이 여러 개이고 "어떤 순서/규칙으로 자식을 틱할지"만 결정하는 뼈대 노드다.
    Action 노드는 자식이 없는 말단(Leaf) 노드로, 실제로 로봇이 수행할 작업 내용을 담고 있다.

!!! question "Q2"
    Fallback 노드에서 첫 번째 자식이 SUCCESS를 반환하면 어떤 일이 일어나는가?

??? success "정답"
    Fallback은 즉시 실행을 멈추고(나머지 자식은 틱하지 않고) SUCCESS를 부모에게 반환한다.

!!! question "Q3"
    Action 노드가 RUNNING을 반환했을 때, 그 Action의 부모가 Sequence라면 다음 Tick에서 무슨 일이 일어나는가?

??? success "정답"
    Sequence는 RUNNING을 반환한 그 자식부터 다시 틱한다. 이미 SUCCESS로 끝난 앞의 자식들은 다시 실행하지 않는다.

---

## 다음 세션 예고

**세션 3: Blackboard와 Ports**

- 노드들이 서로 데이터를 주고받는 공유 저장소 Blackboard
- Input/Output Port와 XML `{key}` 리매핑 문법

[다음 세션 → 세션 3 · Blackboard와 Ports](session-03-blackboard-ports.md){ .md-button .md-button--primary }
