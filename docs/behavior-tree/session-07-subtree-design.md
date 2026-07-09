# Subtree와 설계 패턴

    - **핵심 목표**: Subtree로 트리를 모듈화하는 방법, 포트 리매핑, 계층적 BT 설계 원칙
    - **참고 자료**: [behaviortree.dev - Remapping ports of a SubTree](https://www.behaviortree.dev/docs/3.8/tutorial-basics/tutorial_06_subtree_ports/)
    - **수학/수식**: 이번 세션에는 없음

---

## 한 줄 요약

> Subtree는 "트리 전체를 하나의 부품(노드)처럼 다른 트리 안에 끼워 넣는 기능"으로, 큰 트리를 작고 이해 가능한 단위로 쪼개고 재사용할 수 있게 해준다.

---

## 원인과 결과: 왜 트리를 쪼개야 하는가

세션 1~6에서 만든 트리는 아직 작다. 그런데 실제 로봇의 전체 행동(순찰, 충전, 사람 대응, 물건 옮기기, 오류 복구 등)을
전부 하나의 XML에 펼쳐 넣으면 어떻게 될까?

**원인**: 노드가 수백 개인 트리를 하나의 XML 파일에 다 적으면, 사람이 한눈에 구조를 파악할 수 없다.
이는 세션 1에서 FSM이 겪었던 "복잡도 폭발" 문제가 트리 안에서 다시 재현되는 것과 같다. 아무리 트리 구조가
FSM보다 낫다 해도, 노드 수가 무한정 늘어나면 결국 사람이 읽을 수 없는 크기가 된다.

**결과**: BT는 **트리 자체를 하나의 재사용 가능한 부품**으로 만들 수 있게 했다. 이것이 **Subtree**다.
"순찰하기"라는 트리를 하나의 파일로 따로 만들어두고, 메인 트리에서는 그냥 `<SubTree ID="순찰하기" />`라고
한 줄만 적으면 된다. 이렇게 하면 큰 문제를 작은 문제 여러 개로 나누는 **분할 정복(divide and conquer)** 방식으로
BT를 설계할 수 있다.

```
쪼개기 전 (거대한 하나의 트리)              쪼개기 후 (계층적 구조)
──────────────────────────                ──────────────────────

     Root                                        Root
   /  |  \  \  \  \                       ┌───────┼───────┬────────┐
  ... 수백 개 노드 ...                 순찰하기  충전하기  사람대응  오류복구
  (한눈에 안 들어옴)                   (SubTree) (SubTree)(SubTree)(SubTree)
                                        각각 따로 열어서 이해 가능한 크기
```

---

## Subtree 사용법

```xml
<!-- main_tree.xml -->
<root BTCPP_format="4">
  <BehaviorTree ID="MainTree">
    <Fallback>
      <SubTree ID="사람대응" />
      <SubTree ID="순찰하기" />
    </Fallback>
  </BehaviorTree>

  <BehaviorTree ID="순찰하기">
    <Sequence>
      <Action ID="다음지점계산" />
      <Action ID="이동" />
    </Sequence>
  </BehaviorTree>

  <BehaviorTree ID="사람대응">
    <Sequence>
      <Condition ID="IsPersonDetected" />
      <Action ID="StopRobot" />
    </Sequence>
  </BehaviorTree>
</root>
```

`MainTree`는 `순찰하기`와 `사람대응`의 **내부 구현을 전혀 모른다.** 단지 "이 이름의 서브트리를 실행해달라"고만
요청한다. 이는 세션 2에서 배운 "Control 노드는 자식의 내부를 몰라도 된다"는 원칙이 트리 단위로 확장된 것이다.

---

## Subtree의 포트 리매핑 — 서로 다른 Blackboard를 연결하기

**원인**: Subtree는 독립적인 재사용 부품이어야 하므로, 기본적으로는 **자기만의 별도 Blackboard**를 가진다.
그런데 가끔은 부모 트리가 가진 데이터(예: 목표 좌표)를 Subtree에게 전달해야 할 때가 있다.

**결과**: `<SubTree>` 태그에도 세션 3에서 배운 것과 똑같은 포트 리매핑 문법을 쓸 수 있다.

```xml
<SubTree ID="물체집기" target_pose="{found_object_xy}" />
```

```
부모 트리 Blackboard              Subtree("물체집기") 내부 Blackboard
──────────────────                ──────────────────────────────
  found_object_xy  ───전달───▶     target_pose (Subtree 안에서는 이 이름으로 사용)
```

부모의 `found_object_xy`라는 key와 Subtree 내부의 `target_pose`라는 key 이름이 달라도 상관없다.
리매핑을 통해 서로 다른 이름의 key를 자유롭게 연결할 수 있어서, Subtree는 어떤 이름 규칙을 쓰는 부모 트리에도
그대로 재사용될 수 있다.

---

## 계층적 BT 설계 원칙 3가지

**원인과 결과 관점에서 정리하면**, Subtree를 잘 쓰기 위한 설계 원칙은 다음과 같다.

1. **한 Subtree는 "하나의 명확한 임무"만 책임진다** — "순찰하기" 안에 "충전하기" 로직까지 섞으면, 다시 트리가 커지고
   재사용성이 사라진다 (세션 2의 "역할 분리 원칙"과 동일한 이유).
2. **Subtree 이름은 임무의 목적을 드러내야 한다** — 나중에 다른 개발자(또는 몇 달 뒤의 자신)가 XML만 보고도
   무슨 일을 하는 트리인지 알 수 있어야 한다.
3. **최상위 트리는 "우선순위 목록"처럼 얇게 유지한다** — Root 근처는 Fallback/Sequence 몇 개로 큰 그림만 보여주고,
   구체적인 세부 동작은 전부 하위 Subtree로 위임한다.

```
좋은 계층 구조 예시

Root (Fallback: 우선순위대로)
 ├── SubTree: 긴급정지대응        ← 가장 급한 것부터
 ├── SubTree: 배터리부족대응
 ├── SubTree: 사람안내
 └── SubTree: 기본순찰

각 SubTree 내부는 그 임무에만 집중된 Sequence/Fallback으로 구성됨
```

---

## 핵심 개념 정리

!!! tip "이 세션의 핵심 3가지"
    1. **Subtree = 트리 전체를 하나의 재사용 가능한 부품처럼 다루는 기능** — 거대한 트리를 사람이 이해 가능한 크기로 분할한다.
    2. **Subtree는 기본적으로 독립된 Blackboard를 가진다** — 부모와 데이터를 주고받으려면 포트 리매핑으로 명시적으로 연결해야 한다.
    3. **좋은 설계는 "하나의 Subtree = 하나의 명확한 임무"** — Root 근처는 얇게, 세부 로직은 하위 Subtree로 위임한다.

---

## 복습 (15분)

### 직접 그려보기

아래 요구사항을 만족하는 최상위 트리(Root)의 계층 구조를 Subtree 이름만으로 그려보세요:
"긴급정지가 최우선, 그다음 배터리 관리, 마지막으로 평소 순찰"

??? success "정답"
    ```
    Fallback (Root)
     ├── SubTree: 긴급정지
     ├── SubTree: 배터리관리
     └── SubTree: 순찰
    ```
    Fallback은 왼쪽부터 확인하므로, 가장 우선순위 높은 "긴급정지"를 맨 앞에 둔다.

### 퀴즈

!!! question "Q1"
    Subtree를 쓰지 않고 모든 로직을 하나의 XML에 펼쳐 적으면 어떤 문제가 생기는가?

??? success "정답"
    노드 수가 많아질수록 전체 구조를 한눈에 파악하기 어려워지고, 특정 임무 로직을 재사용하거나 독립적으로 테스트하기 어려워진다.
    이는 FSM이 겪었던 "복잡도 폭발" 문제가 트리 내부에서 다시 나타나는 것과 같다.

!!! question "Q2"
    부모 트리의 `robot_pose`라는 key 값을 Subtree 내부에서는 `current_pose`라는 이름으로 쓰고 싶다면 어떻게 하는가?

??? success "정답"
    `<SubTree ID="..." current_pose="{robot_pose}" />` 처럼 Subtree 태그에서 포트 리매핑 문법을 사용해
    부모의 key 이름과 Subtree 내부 key 이름을 명시적으로 연결한다.

!!! question "Q3"
    "하나의 Subtree는 하나의 명확한 임무만 책임져야 한다"는 원칙을 어기면 어떤 결과로 이어지는가?

??? success "정답"
    여러 임무 로직이 뒤섞여 Subtree가 다시 거대해지고, 특정 부분만 재사용하거나 수정하기 어려워져 결국 처음에
    Subtree로 분리한 목적(모듈화, 재사용성)이 무의미해진다.

---

## 다음 세션 예고

**세션 8: 커스텀 노드 개발**

- SyncActionNode(동기) vs StatefulActionNode(비동기)의 차이
- halt() 처리와 실제 C++ 코드로 나만의 Action 만들기

[다음 세션 → 세션 8 · 커스텀 노드 개발](session-08-custom-nodes.md){ .md-button .md-button--primary }
