# LaCAM: Search-Based Algorithm for Quick Multi-Agent Pathfinding

!!! info "논문 정보"
    - **저자**: Keisuke Okumura (Tokyo Institute of Technology)
    - **학회**: AAAI 2023
    - **키워드**: MAPF, Two-Level Search, Complete Algorithm, Scalability

---

## 한 줄 요약

> Lazy하게 successor를 생성하는 2단계 탐색으로 수백~수만 에이전트 MAPF를 빠르게 푸는 complete 알고리즘.

---

## 문제 정의

그래프 $G = (V, E)$ 위에서 $n$개의 에이전트가 각자의 시작점 $s_i$에서 목표점 $g_i$로 이동하는 충돌 없는 경로를 찾는 문제.

충돌의 종류:

- **Vertex conflict**: 같은 시간에 같은 정점에 두 에이전트가 존재
- **Swap conflict**: 두 에이전트가 같은 간선을 반대 방향으로 동시에 이동

solution quality는 **Sum-of-Costs (SOC)** 로 측정한다.

$$\text{SOC} = \sum_{i \in A} T_i$$

---

## 핵심 아이디어

### 왜 기존 방법은 느린가?

일반적인 A\* 기반 MAPF는 한 노드에서 $O(\Delta^{|A|})$개의 successor를 생성한다.  
에이전트 수가 늘어날수록 branching factor가 폭발적으로 증가한다.

### LaCAM의 접근

**Lazy하게 successor를 생성한다.**

처음에는 successor를 하나만 만들고, 필요할 때 추가로 생성한다.  
이 "게으른" 생성 방식이 사실상의 branching factor를 극적으로 줄인다.

---

## 알고리즘

LaCAM은 **2단계 탐색**으로 구성된다.

### Configuration

모든 에이전트의 위치를 묶은 튜플. 예: $(s_1, s_2, \ldots, s_n)$.  
탐색의 기본 단위.

### High-Level Search

Configuration의 **시퀀스**를 탐색한다.

- Open list를 **stack**으로 구현 → depth-first 방식
- 각 고수준 노드는 configuration과 constraint tree를 가짐
- 목표 configuration $\mathcal{G}$에 도달하면 backtrack으로 solution 추출

### Low-Level Search

각 고수준 노드가 호출될 때마다 **constraint tree**를 조금씩 확장한다.

- **Breadth-first search** 방식
- Constraint: "에이전트 $i$는 다음 스텝에 정점 $u$에 있어야 한다"
- 트리의 깊이가 $|A|$를 넘으면 모든 에이전트에 제약이 할당된 것

### Configuration Generation

저수준 노드가 지정한 constraint를 만족하는 새로운 configuration을 생성한다.

논문에서는 **PIBT** (Priority Inheritance with Backtracking)를 사용해서 promising한 다음 configuration을 만든다.

!!! note "핵심 통찰"
    PIBT처럼 목표 방향으로 promising한 configuration을 생성하면,  
    첫 번째로 만든 successor가 좋은 방향일 가능성이 높아진다.  
    결과적으로 탐색 노드 수가 대폭 줄어든다.

### Agent 순서

- **초기 노드**: start-goal 거리 내림차순 (멀리 가야 하는 에이전트 우선)
- **이후 노드**: goal에 아직 없는 에이전트 우선, tiebreak는 마지막 도착 시각

---

## 완전성 증명

탐색 공간이 유한하기 때문에 complete.

- 고수준: configuration 수 = $O(|V|^{|A|})$
- 저수준: 탐색 iteration 수 = $O(\Delta^{|A|+1})$

저수준 탐색이 끝나면 해당 고수준 노드와 연결 가능한 모든 configuration이 생성됨.  
따라서 시작 configuration에서 도달 가능한 모든 configuration이 탐색된다. $\square$

---

## 실험 결과

### Small Complicated Instances

| 알고리즘 | 해결 수 |
|---------|--------|
| **LaCAM** | **6/6** |
| PP | 1/6 |
| PIBT | 0/6 |
| PIBT+ | 5/6 |
| EECBS | 3/6 |
| LNS2 | 3/6 |

LaCAM만 모든 인스턴스를 해결했다. SOC는 PP, EECBS, LNS2보다 높지만, 풀지 못하는 것보다는 낫다.

### MAPF Benchmark

- 대부분 시나리오에서 **success rate와 runtime** 모두 PP, OD, EECBS, LNS2를 앞섬
- `random-32-32-20` 400 에이전트: LaCAM만 전부 해결, 다른 알고리즘은 거의 실패
- SOC는 PIBT+보다 대체로 우수

### 확장성 테스트

`warehouse-20-40-10-2-2` 맵에서 최대 **10,000 에이전트**:

- **LaCAM만 전부 해결**
- 최대 30초 이내 해결

---

## 한계

**좁은 통로(narrow corridor)에서 성능 급락.**

두 에이전트가 좁은 통로에서 서로 위치를 바꿔야 하는 상황에서 탐색 반복 횟수가 폭발적으로 증가한다.

| 에이전트 수 | 탐색 반복 횟수 |
|------------|-------------|
| 2 | 128 |
| 4 | 23,907 |
| 6 | 287,440 |

Depth-first 방식 특성상, 이런 병목 configuration을 만나면 타임아웃이 날 때까지 빠져나오지 못할 수 있다.

---

## 설계 선택의 영향

| 변형 | 관찰 |
|------|------|
| Base (PIBT + reinsert) | 가장 좋은 성능 |
| DFS (reinsert 없음) | SOC 저하 |
| GREEDY (단순 greedy generator) | 대부분 실패 |

**Configuration generator의 선택이 성능을 결정한다.**  
Reinsert 연산은 SOC를 개선하며, completeness는 유지된다.

---

## 읽고 나서

**인상적인 점**

기존 MAPF 알고리즘들이 CBS처럼 "충돌을 발견하고 제약을 추가"하는 방식이었다면,  
LaCAM은 "제약을 먼저 만들고 그에 맞는 configuration을 찾는" 역방향 사고가 흥미하다.  
그리고 이 제약 탐색을 lazy하게 함으로써 속도를 얻었다는 발상이 깔끔하다.

**의문점**

- PIBT를 configuration generator로 쓰기 때문에 LaCAM의 성능이 PIBT 성능에 크게 의존한다.  
  PIBT가 잘 못 푸는 상황(좁은 통로)에서 LaCAM도 함께 무너지는 것이 이를 보여준다.  
  더 robust한 generator가 있다면 어떨까?
- Optimal LaCAM은 이후 논문에서 다뤄지는지 찾아봐야겠다.
