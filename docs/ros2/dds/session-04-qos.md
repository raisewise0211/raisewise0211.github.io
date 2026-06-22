# QoS 정책 마스터 (핵심 중의 핵심)

!!! info "세션 정보"
    - **학습 시간**: 2시간 (학습 1h 45m + 복습 15m)
    - **핵심 목표**: ROS2에서 가장 자주 쓰는 QoS 정책 완전 이해
    - **관련 표준**: OMG DDS QoS Policies

---

## 한 줄 요약

> QoS는 **DataWriter와 DataReader 사이의 통신 품질 계약**이다. **Reliability**(손실 허용 여부), **Durability**(과거 데이터 제공 여부), **History**(버퍼 크기), **Deadline/Liveliness/Lifespan**(실시간성)을 조합해 토픽 특성에 맞는 통신을 설계한다.

---

## Reliability — 신뢰성

가장 중요한 QoS. 메시지 손실을 허용할지 여부를 결정한다.

```
BEST_EFFORT
  → 보내고 끝. 손실돼도 재전송 없음
  → UDP 그대로의 특성
  → 오버헤드 최소

RELIABLE
  → HEARTBEAT/ACKNACK으로 손실 감지 + 재전송
  → 모든 메시지 반드시 전달 보장
  → 오버헤드 발생
```

| 사용 상황 | 권장 |
|-----------|------|
| 라이다, IMU, 카메라 (고빈도) | BEST_EFFORT |
| cmd_vel, action goal, 서비스 | RELIABLE |
| 맵, 파라미터, 설정값 | RELIABLE |

---

## Durability

**"늦게 참여한 구독자에게 과거 데이터를 줄 것인가?"**

```
VOLATILE (기본값)
  구독자가 연결되기 전에 발행된 데이터 → 버림
  연결 이후 데이터만 수신 가능

  t=0s  DataWriter가 맵 데이터 발행
  t=5s  DataReader 노드 시작
  → DataReader는 맵 데이터 못 받음 ✗


TRANSIENT_LOCAL
  DataWriter가 마지막으로 보낸 데이터를 메모리에 보관
  늦게 참여한 DataReader에게 즉시 전달

  t=0s  DataWriter가 맵 데이터 발행 (메모리에 보관)
  t=5s  DataReader 노드 시작
  → DataReader가 즉시 과거 맵 데이터 수신 ✓
```

### 실전 조합 예시

```
맵 서버 → /map 토픽:
  Reliability:  RELIABLE
  Durability:   TRANSIENT_LOCAL
  → 어느 시점에 시작해도 맵을 받을 수 있음

로봇 위치 → /odom 토픽:
  Reliability:  BEST_EFFORT
  Durability:   VOLATILE
  → 최신값만 필요, 과거 위치는 무의미
```

!!! warning "Durability 호환성 규칙"
    TRANSIENT_LOCAL DataWriter ↔ VOLATILE DataReader → **연결됨** (Writer가 더 강한 보장)
    VOLATILE DataWriter ↔ TRANSIENT_LOCAL DataReader → **연결 안 됨** (Writer가 요구를 못 채움)

---

## History

**"DataWriter/DataReader가 데이터를 몇 개까지 버퍼에 쌓아둘 것인가?"**

```
KEEP_LAST(N)  ← 기본값, N=10
  최근 N개만 보관, 오래된 것은 버림
  메모리 사용량 예측 가능

KEEP_ALL
  모든 데이터 보관 (자원이 허용하는 한)
  RELIABLE과 함께 써야 의미 있음
  메모리 무한 증가 가능 → 주의
```

### Reliability와 History의 관계

```
BEST_EFFORT + KEEP_LAST(1)
  → 항상 최신값 1개만 유지 → 센서 데이터에 적합

RELIABLE + KEEP_ALL
  → 모든 메시지 보장 전달 → 명령/이벤트 큐에 적합

RELIABLE + KEEP_LAST(10)
  → 최근 10개까지만 재전송 보장 → 일반적인 안정적 통신에 적합
```

---

## Deadline, Liveliness, Lifespan

실시간 시스템을 위한 QoS 3총사.

### Deadline — 주기 보장

**"DataWriter는 N초마다 반드시 데이터를 보내야 한다"**

```
설정: Deadline = 100ms

DataWriter가 100ms 안에 publish() 안 하면
  → on_offered_deadline_missed() 콜백 호출

DataReader가 100ms 안에 데이터 못 받으면
  → on_requested_deadline_missed() 콜백 호출
```

사용 예: `/cmd_vel`이 100ms 이상 안 오면 로봇 정지

### Liveliness — 생존 감시

**"이 노드가 아직 살아있는가?"**

```
AUTOMATIC
  DDS가 자동으로 Liveliness 메시지 전송
  노드 코드에서 별도 처리 불필요

MANUAL_BY_TOPIC
  DataWriter가 직접 assert_liveliness() 호출해야 함
  publish()가 없어도 살아있음을 선언 가능

lease_duration: 생존 확인 주기
  이 시간 안에 Liveliness 신호 없으면 → "죽었다" 판정
  → on_liveliness_changed() 콜백 호출
```

### Lifespan — 데이터 유효기간

**"이 데이터는 N초 후에는 의미가 없다"**

```
Lifespan = 500ms 설정 시

DataWriter가 데이터 발행
  → 500ms 후에도 DataReader에 전달 안 됐으면 → 버림
  → 오래된 데이터가 뒤늦게 전달되는 문제 방지
```

---

## QoS 호환성 매트릭스 (암기 필수)

| QoS 항목 | Writer 제공 | Reader 요청 | 호환? |
|----------|------------|------------|-------|
| Reliability | BEST_EFFORT | BEST_EFFORT | ✓ |
| Reliability | RELIABLE | BEST_EFFORT | ✓ |
| Reliability | BEST_EFFORT | RELIABLE | **✗** |
| Reliability | RELIABLE | RELIABLE | ✓ |
| Durability | TRANSIENT_LOCAL | VOLATILE | ✓ |
| Durability | VOLATILE | TRANSIENT_LOCAL | **✗** |
| Durability | TRANSIENT_LOCAL | TRANSIENT_LOCAL | ✓ |

!!! danger "원칙"
    **Writer 제공 ≥ Reader 요청** 이어야 연결됨. ROS2 토픽이 연결 안 될 때 90%는 이 규칙 위반이다.

---

## 핵심 개념 정리

!!! tip "세션 4 핵심 3가지"
    1. **Reliability**: BEST_EFFORT(고빈도 센서) vs RELIABLE(명령/이벤트)
    2. **Durability**: TRANSIENT_LOCAL이면 늦게 참여해도 과거 데이터 수신 가능
    3. **호환성 원칙**: Writer 제공 ≥ Reader 요청 — 어기면 연결 안 됨

---

## 복습 (15분)

!!! question "Q1"
    `/map` 토픽에 적합한 Reliability + Durability 조합은? 이유와 함께.

??? success "정답"
    **RELIABLE + TRANSIENT_LOCAL**. 맵 데이터는 손실 없이 전달돼야 하고(RELIABLE), 노드가 늦게 시작해도 마지막 맵을 받아야 하므로(TRANSIENT_LOCAL) 이 조합이 필요하다.

!!! question "Q2"
    VOLATILE DataWriter ↔ TRANSIENT_LOCAL DataReader — 연결되는가?

??? success "정답"
    **연결되지 않는다.** Reader가 과거 데이터 보관(TRANSIENT_LOCAL)을 요청했는데 Writer는 그걸 제공하지 않으므로(VOLATILE) Writer 제공 < Reader 요청 → 호환 실패.

!!! question "Q3"
    Deadline QoS를 100ms로 설정했는데 DataWriter가 200ms에 한 번 발행한다면?

??? success "정답"
    100ms 주기 약속을 어겼으므로 `on_offered_deadline_missed()` 콜백이 호출된다. 데이터 전송 자체가 막히는 건 아니지만, 애플리케이션이 이 콜백으로 이상 상황을 감지할 수 있다.

!!! question "Q4"
    Liveliness와 Deadline의 차이는?

??? success "정답"
    - **Liveliness**: 노드(DataWriter)가 "살아있는가" 자체를 감시
    - **Deadline**: 살아있더라도 "약속된 주기 안에 데이터를 보냈는가"를 감시
    
    즉 Liveliness는 생사 여부, Deadline은 주기 준수 여부를 다룬다.

---

## 다음 세션 예고

**세션 5: DDS 미들웨어 구현체 비교 (rmw 레이어)**

- rmw(ROS Middleware Interface) 추상화 계층 구조
- Fast DDS vs CycloneDDS 비교
- RMW_IMPLEMENTATION 환경변수
