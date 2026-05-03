# PIBT: Priority Inheritance with Backtracking for Iterative Multi-agent Path Finding

!!! info "논문 정보"
    - **저자**: Keisuke Okumura, Manao Machida, Xavier Défago, Yasumasa Tamura
    - **학회**: IJCAI 2019
    - **키워드**: MAPF, Iterative MAPF, Priority Inheritance, Decentralized

---

## 한 줄 요약

> 동적 우선순위와 priority inheritance, backtracking을 결합해 반복적 MAPF를 매 timestep 단위로 빠르게 푸는 분산 알고리즘.

---

## 배경: Iterative MAPF

기존 MAPF 연구의 대부분은 **one-shot** 버전을 다룬다.  
에이전트가 목표에 한 번 도달하면 끝.

하지만 실제 창고 로봇 시스템에서는 **목표에 도달하면 새 목표가 주어지는** 반복적 시나리오가 일반적이다. 이를 **Iterative MAPF** 라 부른다.

PIBT는 이 반복적 MAPF를 위해 설계됐다.

---

## 핵심 아이디어

PIBT는 **WHCA\*** (Windowed HCA\*)를 window size 1로 구현한 것에서 출발한다.  
즉, 한 번에 딱 **한 timestep 앞**만 계획한다.

여기에 두 가지 메커니즘을 추가한다.

### Priority Inheritance (우선순위 상속)

우선순위만으로는 deadlock이 생긴다.

낮은 우선순위 에이전트 $a_0$가 중간 에이전트 $a_1$에게 막혀 이동 못 할 때,  
높은 우선순위 에이전트 $a_2$는 결국 $a_0$ 때문에 진행이 막힌다.

**Priority Inheritance**: $a_0$가 $a_2$의 우선순위를 임시 상속하면,  
$a_0$가 갑자기 가장 높은 우선순위가 되어 $a_1$이 비켜준다.

### Backtracking

Priority Inheritance만으로는 여전히 막히는 경우가 있다.  
연쇄 상속($a_6 \to a_5 \to a_4 \to a_3$) 끝에 $a_3$가 갈 곳이 없으면 전체가 멈춘다.

**Backtracking**: 막힌 에이전트가 `invalid`를 반환하면,  
우선순위를 건네준 에이전트가 다른 선택지를 탐색하거나 자신도 `invalid`를 올려 보낸다.

---

## 알고리즘

### 우선순위 정의

$$p_i(t) = \eta_i(t) + \epsilon_i$$

- $\eta_i(t)$: 에이전트 $i$가 마지막으로 목표를 갱신한 뒤 경과한 timestep 수
- $\epsilon_i \in [0, 1)$: 에이전트마다 고유한 값 (동점 방지)

목표에 도달하면 $\eta_i$가 리셋 → priority가 가장 낮아짐 → 다른 에이전트에게 양보.  
이 구조 덕분에 **모든 에이전트가 공정하게 기회를 얻는다**.

### 한 timestep의 흐름

1. 모든 에이전트의 priority 갱신
2. UNDECIDED에서 가장 높은 priority 에이전트 선택
3. `PIBT(a, ⊥)` 호출

```
function PIBT(aᵢ, aⱼ):
    Cᵢ = 이동 가능한 후보 노드 (인접 + 현재 위치)
         - 다른 에이전트가 요청한 노드 제외
         - 상속받은 에이전트가 금지한 노드 제외
         - aⱼ의 현재 위치 제외 (교차 충돌 방지)

    while Cᵢ ≠ ∅:
        v* = Cᵢ에서 가장 가치 있는 노드  # 목표까지 거리 기준
        
        if v*에 다른 에이전트 aₖ가 있으면:
            if PIBT(aₖ, aᵢ) == valid:
                vᵢ(t+1) = v*
                return valid
            else:
                Cᵢ에서 막힌 노드들 제거
        else:
            vᵢ(t+1) = v*
            return valid

    vᵢ(t+1) = vᵢ(t)   # 제자리 대기
    return invalid
```

---

## 이론적 보장

### Lemma 1

그래프의 모든 인접 노드 쌍이 길이 3 이상의 simple cycle에 속한다면,  
**가장 높은 priority를 가진 에이전트는 항상 이동할 수 있다.**

직관: 에이전트가 cycle 위에 있으면 항상 "비켜갈 공간"이 존재한다.

### Theorem 2

위 조건을 만족하는 그래프에서, PIBT는 모든 에이전트가  
**$\text{diam}(G) \cdot |A|$ timestep 이내에** 각자의 목표에 도달함을 보장한다.

!!! note "어떤 그래프가 조건을 만족하는가?"
    Biconnected undirected graph가 대표적인 예.  
    Directed ring도 만족한다. 단순 격자(4-connected grid)도 만족한다.

### 시간 복잡도

$$O(|A| \cdot \Delta(G) \cdot F)$$

- $\Delta(G)$: 그래프 최대 차수
- $F$: 노드 가치 함수 $f_i$ 계산 비용

---

## MAPF vs MAPD에서의 적용

### MAPF (One-shot)

PIBT는 iterative 용도로 설계됐기 때문에, **one-shot MAPF에서는 complete가 아니다.**

모든 에이전트가 동시에 목표에 있어야 하는 조건을 보장하지 못하며,  
livelock 상황이 실험에서도 관찰됐다.

### MAPD (Iterative Pickup & Delivery)

MAPD는 iterative MAPF의 대표적인 구체 문제.  
Theorem 2에 의해 PIBT는 MAPD를 **complete하게 해결**한다.

태스크 할당은 단순하게: 각 free 에이전트가 가장 가까운 미할당 pickup 위치로 이동하고, 도착하면 태스크를 가져간다.

---

## 실험 결과

### MAPF

| 특성 | 결과 |
|------|------|
| 대규모 맵(ost003d, 194×194) | PIBT가 runtime 측면에서 WHCA\* 압도 |
| 고밀도 소규모 맵(8×8) | success rate 낮음 (livelock 발생) |
| Path cost | WHCA\*보다 다소 높으나 makespan은 오히려 비슷하거나 우수 |

makespan이 WHCA\*보다 나은 이유:  
PIBT의 동적 우선순위는 목표에 도달한 에이전트의 priority를 낮춰, 아직 못 도착한 에이전트들이 먼저 움직이게 만든다. 이 공정성이 makespan을 줄인다.

### MAPD

PIBT가 Token Passing(TP)을 makespan, service time, runtime **모두에서** 앞선다.

이유: free 에이전트 위치를 무시하고 계획 → 계산 비용이 낮음.

---

## 한계

- **One-shot MAPF에서 livelock 가능**: complete하지 않음
- **좁은 공간(cycle 조건 미충족)**: 이론적 보장 없음
- **Solution quality**: path cost가 WHCA\*보다 높은 경향 (한 timestep 계획의 한계)

---

## LaCAM과의 관계

LaCAM을 읽고 이 논문을 보면 연결고리가 보인다.

LaCAM은 PIBT를 **configuration generator**로 활용한다.  
PIBT가 "다음 한 걸음"을 빠르게 계획한다는 특성을 이용해,  
LaCAM의 high-level 탐색에서 promising한 successor를 만드는 데 쓴다.

PIBT가 좁은 통로에서 약하다는 것이 LaCAM의 약점으로도 이어진 이유가 여기 있다.

---

## 읽고 나서

**인상적인 점**

Priority Inheritance는 원래 실시간 OS의 자원 잠금 문제를 해결하기 위한 개념인데,  
그것을 MAPF의 경로 계획에 적용한 발상이 흥미롭다.  
각자 "길을 비켜주는" 행동이 자연스럽게 재귀 구조로 표현된다.

**의문점**

- window size를 1보다 크게 하면 성능이 얼마나 좋아질까? 논문에서도 future work로 언급함.
- Livelock은 어떤 조건에서 발생하는지 더 구체적으로 분석된 후속 연구가 있을까?
- PIBT의 $f_i$ (노드 가치 함수) 설계가 성능에 크게 영향을 미칠 것 같은데, 이 부분도 future work로 남겨져 있다.
