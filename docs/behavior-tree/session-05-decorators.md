# Decorator 노드 심화

    - **핵심 목표**: Inverter·Retry·Timeout·ForceSuccess/Failure·RunOnce·Repeat 등 실무에서 자주 쓰는 Decorator 완전 정복
    - **참고 자료**: [behaviortree.dev - Decorators](https://www.behaviortree.dev/docs/nodes-library/decoratornode/)
    - **수학/수식**: 재시도 총 소요시간 계산에 곱셈·덧셈만 사용 (아래 박스에서 상세 설명)

---

## 한 줄 요약

> Decorator는 자식이 반환한 결과(SUCCESS/FAILURE/RUNNING)를 자기 마음대로 "해석을 바꿔서" 부모에게 전달하는, 자식이 정확히 1개뿐인 특수 노드다.

---

## 원인과 결과: 왜 Decorator가 필요한가

세션 2에서 Condition 노드는 "참/거짓만 즉시 확인"한다고 배웠다. 그런데 현실에서는 이런 요구가 자주 생긴다:

- "문이 안 열려도 3번까지는 다시 시도해봐라" (Condition 자체는 재시도 로직이 없음)
- "이 조건은 원래 결과의 반대로 써야 한다" (Condition을 두 번 만들기 싫음)
- "5초 안에 안 끝나면 그냥 실패로 쳐라"

**원인**: 이런 요구를 매번 Action이나 Condition의 C++ 코드 안에 집어넣으면, "재시도 로직"이 코드 곳곳에
중복돼서 나타난다. 로직(무엇을 할지)과 정책(몇 번 재시도할지, 얼마나 기다릴지)을 분리하지 못하면 재사용성이 떨어진다.

**결과**: BT는 **자식 딱 하나만 감싸서, 그 결과를 가공하는 전용 노드**를 따로 만들었다. 이것이 Decorator다.
Decorator는 "포장지"처럼 기존 노드를 감싸기만 하고, 안의 내용물(자식 노드)은 전혀 건드리지 않는다.
그래서 같은 Action에 다른 Decorator를 씌우기만 해도 완전히 다른 동작 정책을 적용할 수 있다.

```
평범한 Action                    Decorator로 감싼 Action
─────────────                   ─────────────────────
  OpenDoor                      Retry(num_attempts=3)
                                       │
                                    OpenDoor

"한 번 해보고 안 되면 그냥 끝"    "3번까지 자동으로 재시도"
```

---

## 실무에서 자주 쓰는 Decorator 6종

| Decorator | 하는 일 | 실생활 비유 |
|-----------|---------|-------------|
| **Inverter** | 자식의 SUCCESS↔FAILURE를 뒤집는다 (RUNNING은 그대로) | "아니오"를 "예"로 바꿔 말하기 |
| **ForceSuccess** | 자식이 뭘 반환하든 무조건 SUCCESS로 바꾼다 | "실패해도 괜찮아, 계속 진행해" |
| **ForceFailure** | 자식이 뭘 반환하든 무조건 FAILURE로 바꾼다 | "성공해도 이건 실패로 쳐야 해" |
| **Retry** | 자식이 FAILURE면 정해진 횟수까지 다시 틱한다 | "안 되면 다시 해봐" |
| **Timeout** | 정해진 시간 안에 끝나지 않으면 강제로 FAILURE 처리 | "5초 넘으면 포기해" |
| **Repeat** | 자식이 SUCCESS여도 정해진 횟수만큼 반복 실행 | "이 동작 5번 반복해" |

---

## 수식이 필요한 부분: Retry와 Timeout의 시간 계산

!!! note "수학 설명 — 왜 이 계산이 필요한가"
    로봇이 실제로 동작할 때 "Retry 3번 + 매 시도마다 Timeout 2초"를 같이 쓰면, **최악의 경우 로봇이 이 작업 하나에
    묶여있는 시간**을 미리 계산해둬야 한다. 그래야 "이 하위 작업에 최대 몇 초까지 써도 되는지" 상위 설계에서 예산을 잡을 수 있다.
    계산 자체는 곱셈과 덧셈뿐이라 어렵지 않다.

    **공식**: 최악의 경우 총 소요시간 = (Timeout 시간) × (Retry 최대 시도 횟수)

    예를 들어 `Timeout(2초)` 안에 `OpenDoor` Action이 있고, 그 바깥을 `Retry(3번)`로 감쌌다면:

    ```
    Retry(num_attempts=3)
         │
      Timeout(msec=2000)
         │
       OpenDoor
    ```

    - 1번째 시도: 최대 2초 대기 후 실패 판정
    - 2번째 시도: 최대 2초 대기 후 실패 판정
    - 3번째 시도: 최대 2초 대기 후 실패 판정
    - **최악의 경우 총합**: 2초 × 3 = **6초**

    즉 이 트리 가지 하나가 "최대 6초까지 로봇을 붙잡아둘 수 있다"는 뜻이다. 이 숫자를 모르고 설계하면,
    상위 트리에서 "10초 안에 전체 임무를 끝내야 한다" 같은 요구사항과 충돌이 나도 알아채기 어렵다.

---

## Decorator 조합 예시: Inverter + Retry

```xml
<Retry num_attempts="3">
  <Inverter>
    <Condition ID="IsDoorLocked" />
  </Inverter>
</Retry>
```

읽는 순서(안에서 바깥으로): "문이 잠겨있는가?"를 확인 → Inverter가 결과를 뒤집어서 "문이 안 잠겨있으면 SUCCESS"로 바꿈
→ 그 결과가 FAILURE(즉, 아직 잠겨있음)이면 Retry가 최대 3번까지 다시 확인한다.

```
[문이 잠겨있음: TRUE]
        │
   IsDoorLocked → SUCCESS(잠겨있다)
        │
    Inverter  → FAILURE (뒤집힘)
        │
     Retry    → 아직 2번 더 시도 가능, 다시 틱
```

---

## 핵심 개념 정리

!!! tip "이 세션의 핵심 3가지"
    1. **Decorator = 자식 1개를 감싸서 결과를 가공하는 노드** — 로직(무엇을 할지)과 정책(어떻게 다룰지)을 분리해준다.
    2. **Inverter/ForceSuccess/ForceFailure는 결과를 "바꿔치기"하고, Retry/Repeat/Timeout은 "실행 횟수·시간"을 조절**한다.
    3. **Retry × Timeout을 함께 쓸 때는 최악의 소요시간 = Timeout × 횟수**로 미리 계산해서 상위 설계 예산과 충돌하지 않는지 확인해야 한다.

---

## 복습 (15분)

### 계산 문제

`Timeout(msec=3000)` 안에 Action이 있고, 그 바깥을 `Retry(num_attempts=4)`로 감쌌다. 최악의 경우 이 가지가
로봇을 얼마나 오래 붙잡아둘 수 있는가?

??? success "정답"
    3초 × 4번 = **12초**

### 퀴즈

!!! question "Q1"
    Inverter와 ForceFailure의 차이는 무엇인가?

??? success "정답"
    Inverter는 자식의 결과를 "반대로" 바꾼다(SUCCESS↔FAILURE, RUNNING은 그대로 유지).
    ForceFailure는 자식이 무엇을 반환하든 상관없이 무조건 FAILURE로 강제 고정한다.

!!! question "Q2"
    "문 열기를 최대 3번까지 재시도하되, 한 번의 시도는 2초를 넘기지 않게 하라"는 요구사항을 Decorator 두 개로 어떻게 조합하는가?

??? success "정답"
    `Retry(num_attempts=3)` 로 바깥을 감싸고, 그 안에 `Timeout(msec=2000)` 을 넣고, 그 안에 실제 `OpenDoor` Action을 넣는다.

!!! question "Q3"
    Decorator가 "로직과 정책을 분리한다"는 것은 구체적으로 어떤 의미인가?

??? success "정답"
    Action의 C++ 코드(로직, 예: OpenDoor)는 전혀 수정하지 않고, 그 바깥을 어떤 Decorator로 감싸느냐(정책, 예: 3번 재시도 여부)만
    XML에서 바꿔서 완전히 다른 동작 방식을 적용할 수 있다는 뜻이다.

---

## 다음 세션 예고

**세션 6: Reactive 실행모델**

- Sequence vs ReactiveSequence, Fallback vs ReactiveFallback의 근본적 차이
- Parallel 노드의 성공/실패 임계값 계산

[다음 세션 → 세션 6 · Reactive 실행모델](session-06-reactive-execution.md){ .md-button .md-button--primary }
