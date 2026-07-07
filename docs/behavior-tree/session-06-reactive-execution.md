# Reactive 실행모델

    - **핵심 목표**: Sequence vs ReactiveSequence, Fallback vs ReactiveFallback의 차이, Parallel 노드의 성공/실패 임계값
    - **참고 자료**: [behaviortree.dev - Control Nodes](https://www.behaviortree.dev/docs/nodes-library/controlnode/)
    - **수학/수식**: Parallel 임계값 계산 (아래 박스에서 상세 설명)

---

## 한 줄 요약

> 일반 Sequence/Fallback은 RUNNING인 자식을 "기억"하고 앞의 자식을 다시 확인하지 않지만, Reactive 버전은 매 Tick마다 처음부터 다시 확인해서 조건 변화에 즉각 반응한다.

---

## 원인과 결과: 왜 "다시 확인하는" 버전이 따로 필요한가

세션 2에서 배운 Sequence는 이런 식으로 동작한다: "자식 A가 SUCCESS면, 다음 틱부터는 A를 건너뛰고 RUNNING인
자식부터 다시 확인한다." 이건 효율적이지만 문제가 있다.

**원인**: "배터리가 충분한지 확인(A) → 목표지점으로 이동(B, RUNNING 상태로 오래 지속)" 이라는 Sequence를 생각해보자.
이동 도중에 배터리가 갑자기 부족해져도, 일반 Sequence는 A를 다시 확인하지 않고 B만 계속 틱한다. 이미 A가
SUCCESS로 끝났다고 "기억"하고 있기 때문이다. 이러면 배터리가 바닥나는 위험한 상황에서도 로봇이 계속 이동해버릴 수 있다.

**결과**: BT는 **매 Tick마다 항상 자식 A부터 다시 확인하는 버전**을 별도로 만들었다. 이것이 ReactiveSequence다.
"조건이 실시간으로 바뀔 수 있는 상황"에서는 반드시 Reactive 버전을 써야 안전하다.

```
일반 Sequence의 동작                       ReactiveSequence의 동작
───────────────────                       ───────────────────
Tick1: A(SUCCESS) → B(RUNNING)            Tick1: A(SUCCESS) → B(RUNNING)
Tick2: A 건너뜀 → B(RUNNING)               Tick2: A 다시확인(SUCCESS) → B(RUNNING)
Tick3: A 건너뜀 → B(RUNNING)               Tick3: A 다시확인(FAILURE!) → 즉시 멈춤
       (배터리 위험해도 계속 이동)                  (배터리 위험 감지, 즉시 중단)
```

---

## Sequence 계열 정리

| 노드 | 자식이 SUCCESS로 끝나면 | 조건(Condition) 재확인 여부 | 용도 |
|------|--------------------------|------------------------------|------|
| **Sequence** | 다음 Tick부터 그 자식은 건너뜀 (메모리 있음, `SequenceWithMemory`라고도 불림) | 안 함 | 순서가 중요하고, 앞선 단계가 취소될 일이 없는 경우 |
| **ReactiveSequence** | 매 Tick마다 처음부터 다시 확인 | 함 | 조건이 실시간으로 바뀔 수 있고, 즉시 반응해야 하는 경우 |

## Fallback 계열 정리

| 노드 | 동작 | 용도 |
|------|------|------|
| **Fallback** | 자식이 RUNNING이면 다음 틱에 그 자식부터 이어서, 앞선 자식들은 재확인 안 함 | 여러 대안 중 하나를 선택해 끝까지 밀어붙이는 경우 |
| **ReactiveFallback** | 매 Tick마다 처음 자식부터 다시 확인 — 더 우선순위 높은 대안이 갑자기 가능해지면 즉시 전환 | "더 급한 일이 생기면 하던 일을 멈추고 그쪽으로" 같은 인터럽트 로직 |

---

## Parallel 노드와 임계값(Threshold)

지금까지의 Control 노드는 자식을 한 번에 하나씩만 순서대로 틱했다. 하지만 "왼쪽을 보면서 동시에 앞으로 걷기"처럼
**여러 행동을 동시에** 틱해야 하는 경우도 있다. 이때 쓰는 것이 **Parallel** 노드다.

**원인**: 여러 자식을 동시에 틱하면, "몇 개가 성공해야 전체 성공으로 칠지"를 정해야 하는 새로운 문제가 생긴다.
모든 자식이 성공해야만 하는가? 하나만 성공해도 되는가? 이건 상황마다 다르다.

**결과**: Parallel 노드는 **성공 임계값(success_count)**과 **실패 임계값(failure_count)**을 숫자로 직접 지정하게 만들었다.

!!! note "수학 설명 — 임계값은 단순히 '개수 세기'"
    복잡한 확률이나 통계가 아니라, **정수를 세는 것**뿐이다.

    **규칙**:

    - 자식 중 `success_count` 명 **이상**이 SUCCESS를 반환하면 → Parallel 전체는 SUCCESS
    - 자식 중 `failure_count` 명 **이상**이 FAILURE를 반환하면 → Parallel 전체는 FAILURE
    - 둘 다 아직 아니면 → RUNNING (계속 지켜봄)

    예: 자식이 3개(순찰카메라 감시, 배터리 감시, 이동)이고 `success_count=3`, `failure_count=1`이라면:

    ```
    자식 상태: [SUCCESS, RUNNING, RUNNING]
    → 성공한 개수 = 1개 (3 미만) → 아직 SUCCESS 아님
    → 실패한 개수 = 0개 (1 미만) → 아직 FAILURE 아님
    → 결과 = RUNNING (계속 지켜봄)

    자식 상태: [SUCCESS, FAILURE, RUNNING]
    → 실패한 개수 = 1개 (failure_count=1 이상 충족!)
    → 결과 = FAILURE (즉시 나머지 자식도 멈춤)
    ```

---

## 전체 조합 흐름도

```
                    ReactiveFallback("긴급상황우선")
                    ┌──────────────┴──────────────┐
              사람감지시정지                    Parallel("순찰임무")
           (Sequence, 우선순위 최상위)     success_count=2, failure_count=1
                                          ┌─────┬─────┬─────┐
                                     카메라감시 배터리감시  이동

매 Tick마다 ReactiveFallback은 "사람감지시정지"를 먼저 재확인한다.
사람이 감지되면 즉시 그쪽으로 전환하고, Parallel로 진행하던 순찰임무는 중단된다.
```

---

## 핵심 개념 정리

!!! tip "이 세션의 핵심 3가지"
    1. **Reactive 버전은 매 Tick마다 처음부터 다시 확인**한다 — 안전이 중요한 조건(배터리, 사람 감지)에는 반드시 Reactive를 써야 한다.
    2. **일반 버전은 RUNNING인 자식을 "기억"하고 앞 단계를 재확인하지 않는다** — 효율적이지만, 조건 변화에 둔감할 수 있다.
    3. **Parallel의 success_count/failure_count는 단순한 "개수 세기"** — 몇 명 이상 성공/실패하면 전체 결과를 정할지 숫자로 지정한다.

---

## 복습 (15분)

### 계산 문제

Parallel 노드에 자식이 4개 있고 `success_count=3`으로 설정했다. 지금 자식 상태가 `[SUCCESS, SUCCESS, RUNNING, FAILURE]`라면
Parallel의 현재 결과는 무엇인가?

??? success "정답"
    **RUNNING**. 성공한 개수는 2개로 아직 3개(success_count) 미만이고, failure_count를 별도로 지정하지 않았다면 계속 지켜보는 상태다.
    (만약 failure_count=1로 설정돼 있었다면 FAILURE 1개만으로 즉시 FAILURE가 된다.)

### 퀴즈

!!! question "Q1"
    "배터리 감시" 조건을 Sequence의 첫 자식으로 넣을 때, Sequence 대신 반드시 ReactiveSequence를 써야 하는 이유는?

??? success "정답"
    일반 Sequence는 첫 자식이 한 번 SUCCESS로 끝나면 이후 Tick에서는 재확인하지 않기 때문에, 배터리가 이동 도중 위험 수준으로
    떨어져도 감지하지 못한다. ReactiveSequence는 매 Tick마다 배터리 조건을 다시 확인하므로 실시간으로 안전하게 반응할 수 있다.

!!! question "Q2"
    ReactiveFallback에서 우선순위가 가장 높은 자식을 어디에 배치해야 하는가?

??? success "정답"
    가장 왼쪽(첫 번째 자식)에 배치해야 한다. ReactiveFallback은 매 Tick마다 왼쪽부터 다시 확인하므로, 가장 급한 조건을
    맨 앞에 둬야 그 조건이 만족되는 즉시 우선적으로 처리된다.

!!! question "Q3"
    Parallel 노드에서 `failure_count`를 1로 설정하는 것은 실무적으로 어떤 의미인가?

??? success "정답"
    동시에 실행 중인 자식들 중 단 하나라도 실패하면 전체를 즉시 실패로 처리하겠다는 뜻이다. 예를 들어 "안전 감시" 자식이
    하나라도 실패를 반환하면, 다른 자식들이 아직 진행 중이어도 전체 작업을 즉시 중단시키고 싶을 때 쓴다.

---

## 다음 세션 예고

**세션 7: Subtree와 설계 패턴**

- Subtree 포트 리매핑으로 트리를 모듈처럼 재사용하기
- 계층적 BT 설계 원칙

[다음 세션 → 세션 7 · Subtree와 설계 패턴](session-07-subtree-design.md){ .md-button .md-button--primary }
