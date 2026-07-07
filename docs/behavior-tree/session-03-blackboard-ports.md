# Blackboard와 Ports

    - **핵심 목표**: 노드 간 데이터를 주고받는 Blackboard 개념과 Input/Output Port, XML 리매핑 문법 이해
    - **참고 자료**: [behaviortree.dev - Blackboard and ports](https://www.behaviortree.dev/docs/tutorial-basics/tutorial_02_basic_ports/), [Ports VS Blackboard](https://www.behaviortree.dev/docs/guides/ports_vs_blackboard/)
    - **수학/수식**: 이번 세션에는 없음

---

## 한 줄 요약

> Blackboard는 트리의 모든 노드가 함께 들여다볼 수 있는 "공용 칠판"이고, Port는 그 칠판의 어느 칸을 읽고 쓸지 노드마다 명시적으로 정하는 통로다.

---

## 원인과 결과: 왜 데이터 공유 방법이 필요한가

세션 2에서 만든 노드들은 각자 독립적으로 SUCCESS/FAILURE/RUNNING만 주고받았다. 그런데 실제 로봇 작업은 그렇게
단순하지 않다. 예를 들어 "카메라로 물체를 찾는 Action"이 찾은 물체의 좌표를, "그 좌표로 이동하는 Action"에게
전달해야 한다.

**원인**: 노드는 서로 부모-자식 관계일 뿐, 직접 함수를 호출하거나 변수를 공유할 수 있는 사이가 아니다.
(애초에 노드는 재사용을 위해 서로의 존재를 몰라야 한다 — 세션 2의 "역할 분리" 원칙과 같은 이유다.)
그렇다고 전역 변수를 아무렇게나 쓰면, 어떤 노드가 어떤 데이터를 언제 바꾸는지 추적할 수 없어 다시 스파게티가 된다.

**결과**: BT는 **Blackboard**라는 이름의 key-value 저장소를 트리 전체가 공유하도록 만들고,
각 노드가 "나는 이 key를 읽는다(Input Port)", "나는 이 key에 쓴다(Output Port)"를 **미리 선언**하게 강제한다.
이렇게 하면 트리의 XML만 봐도 "어떤 데이터가 어디서 어디로 흐르는지"가 한눈에 보인다 — 이것이 "self-documenting(자기서술적)"
설계라고 불리는 이유다.

---

## Blackboard 구조 그림

```
                    ┌─────────────────────────────┐
                    │       Blackboard (칠판)      │
                    │  ┌───────────┬─────────────┐ │
                    │  │  key       │  value      │ │
                    │  ├───────────┼─────────────┤ │
                    │  │ target_xy  │ (3.2, 1.5)  │ │
                    │  │ battery    │ 0.82         │ │
                    │  └───────────┴─────────────┘ │
                    └─────────────────────────────┘
                       ▲ write(Output)   │ read(Input)
                       │                 ▼
         ┌─────────────────────┐   ┌─────────────────────┐
         │ Action: FindObject   │   │ Action: MoveTo       │
         │ (물체 좌표를 찾는다)  │   │ (좌표로 이동한다)     │
         │ Output Port:         │   │ Input Port:           │
         │   target_xy 에 쓴다  │   │   target_xy 를 읽는다 │
         └─────────────────────┘   └─────────────────────┘
```

FindObject와 MoveTo는 서로의 존재를 전혀 모른다. 오직 `target_xy`라는 **key 이름**을 통해서만 연결된다.
이것이 "노드는 재사용 가능해야 한다"는 원칙을 지키면서도 데이터를 주고받는 방법이다.

---

## Input Port / Output Port

- **Input Port**: 노드가 실행에 필요한 값을 Blackboard에서 **읽어오는** 통로.
- **Output Port**: 노드가 만들어낸 결과값을 Blackboard에 **써넣는** 통로.

하나의 노드가 Input과 Output을 동시에 가질 수도 있다. 예를 들어 "재시도 횟수를 세는 노드"는
현재 횟수를 읽고(Input), 1 늘린 값을 다시 쓴다(Output).

---

## XML에서 Port를 연결하는 문법: `{key}`

BehaviorTree.CPP는 트리의 실제 구조를 XML 파일로 적는다. Port를 Blackboard의 key에 연결할 때는
중괄호 `{ }`를 사용한다. 중괄호가 없으면 그냥 "고정된 값(리터럴)"으로 취급된다.

```xml
<Sequence name="물체가져오기">
    <FindObject   target="{target_xy}" />
    <MoveTo       goal="{target_xy}"   speed="0.5" />
</Sequence>
```

- `target="{target_xy}"` → **중괄호 있음** → Blackboard의 `target_xy` key와 연결(리매핑)
- `speed="0.5"` → **중괄호 없음** → 그냥 숫자 0.5를 그대로 사용 (Blackboard와 무관)

이 한 줄의 문법 규칙 덕분에, XML 파일만 읽어도 "이 값은 다른 노드가 만든 걸 받는 건지, 아니면 그냥 고정값인지"를
바로 구분할 수 있다.

---

## 왜 "그냥 전역 변수" 대신 Port를 쓰는가 — 재사용성의 핵심

Port 방식의 진짜 장점은 **같은 노드를 XML만 바꿔서 다른 key에 연결할 수 있다**는 것이다.

```xml
<!-- 트리 A: 첫 번째 물체 다루기 -->
<FindObject target="{obj1_xy}" />
<MoveTo     goal="{obj1_xy}" />

<!-- 트리 B: 같은 노드, 다른 key로 재사용 -->
<FindObject target="{obj2_xy}" />
<MoveTo     goal="{obj2_xy}" />
```

`FindObject`와 `MoveTo`의 C++ 코드는 전혀 수정하지 않았다. XML의 key 이름만 바꿔서 완전히 다른 데이터 흐름을
만들었다. 만약 전역 변수를 직접 썼다면, 두 번째 물체를 다루기 위해 새로운 전역 변수와 그 변수를 쓰는 새로운 C++
코드를 또 만들어야 했을 것이다.

---

## 핵심 개념 정리

!!! tip "이 세션의 핵심 3가지"
    1. **Blackboard = 트리 전체가 공유하는 key-value 저장소**, 노드는 이걸 통해서만 간접적으로 데이터를 주고받는다.
    2. **Input Port = 읽기, Output Port = 쓰기** — 노드는 자신이 쓸 key를 미리 선언해야 한다.
    3. **XML에서 `{key}`는 Blackboard 연결, 중괄호 없으면 고정값** — 이 문법 하나로 데이터 흐름이 코드 없이 XML만으로 보인다.

---

## 복습 (15분)

### 빈칸 채우기

아래 XML에서 Blackboard와 연결되는 속성과, 고정값으로 쓰이는 속성을 구분해보세요.

```xml
<MoveTo goal="{target_xy}" speed="1.0" retries="{retry_count}" />
```

??? success "정답"
    - Blackboard 연결(중괄호 있음): `goal="{target_xy}"`, `retries="{retry_count}"`
    - 고정값(중괄호 없음): `speed="1.0"`

### 퀴즈

!!! question "Q1"
    Blackboard 없이 노드끼리 전역 변수로 데이터를 주고받으면 어떤 문제가 생기는가?

??? success "정답"
    어떤 노드가 언제 그 변수를 바꾸는지 추적하기 어려워지고, 노드가 특정 전역 변수 이름에 종속되어 재사용이 어려워진다 (다시 스파게티 구조가 된다).

!!! question "Q2"
    같은 `MoveTo` 노드를 서로 다른 두 위치로 이동시키는 데 재사용하려면 어떻게 해야 하는가?

??? success "정답"
    C++ 코드는 그대로 두고, XML에서 Input Port에 연결하는 key 이름만 바꿔서(`{obj1_xy}` → `{obj2_xy}`) 서로 다른 트리 인스턴스에 배치한다.

!!! question "Q3"
    `<Wait duration="2.0" />` 에서 `duration`은 Blackboard와 연결된 값인가, 고정값인가? 왜 그런가?

??? success "정답"
    고정값이다. 중괄호 `{ }`로 감싸지 않았기 때문에 Blackboard의 어떤 key도 참조하지 않고, 문자 그대로 2.0초라는 값을 사용한다.

---

## 다음 세션 예고

**세션 4: XML과 툴체인**

- XML로 전체 트리를 정의하는 문법과 BehaviorTree.CPP Factory에 노드 등록하기
- Groot2로 트리를 시각화하고 실시간 모니터링하기

[다음 세션 → 세션 4 · XML과 툴체인](session-04-xml-toolchain.md){ .md-button .md-button--primary }
