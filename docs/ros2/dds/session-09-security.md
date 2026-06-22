# 보안 — ROS2 Security (SROS2)

!!! info "세션 정보"
    - **학습 시간**: 2시간 (학습 1h 45m + 복습 15m)
    - **핵심 목표**: DDS Security 플러그인 구조와 SROS2로 노드별 인증·권한을 설정하는 방법 이해
    - **관련 표준**: OMG DDS Security 1.1, SROS2

---

## 한 줄 요약

> DDS Security는 **Authentication(신원 검증), Access Control(권한 제어), Cryptographic(암호화), Logging(기록), Data Tagging(라벨링)** 5개 플러그인으로 구성되며, SROS2는 Keystore와 Enclave로 노드별 인증서·권한을 화이트리스트 방식(Permissions 파일)으로 관리한다.

---

## DDS Security 5가지 플러그인

지금까지는 "어떻게 통신을 연결하고 최적화할까"를 다뤘다면, 이번 세션은 "이 통신을 어떻게 지킬까"다.

### DDS Security 표준 구조

```
DDS Security Plugin Suite
├── Authentication      → "너 누구야?" (참여자 신원 확인)
├── Access Control      → "넌 이거 할 권한 있어?" (토픽별 권한)
├── Cryptographic       → "패킷 암호화" (데이터 기밀성)
├── Logging             → "누가 뭘 했는지 기록"
└── Data Tagging        → "데이터에 보안 라벨 부착"
```

| 플러그인 | 역할 | 예시 |
|----------|------|------|
| **Authentication** | DomainParticipant 신원 검증 | X.509 인증서 기반 상호 인증 |
| **Access Control** | Topic/Partition 단위 권한 제어 | "이 노드는 `/cmd_vel`만 발행 가능" |
| **Cryptographic** | 메시지 암호화/복호화 | AES-128/256으로 페이로드 암호화 |
| **Logging** | 보안 이벤트 기록 | 인증 실패, 권한 위반 로그 |
| **Data Tagging** | 데이터 민감도 라벨링 | "이 토픽은 기밀 등급 3" |

### 동작 흐름

```
노드 A 시작 시도
    │
    ▼
1. Authentication: 인증서로 신원 증명
    │ (X.509 인증서 + Identity CA 검증)
    ▼
2. Access Control: Permissions 파일로 권한 확인
    │ ("이 노드는 어떤 Topic을 Pub/Sub 할 수 있나")
    ▼
3. Cryptographic: 통신 채널 암호화 키 교환
    │
    ▼
4. 정상 통신 시작 (암호화된 RTPS 패킷)
```

### Authentication vs Access Control

!!! warning "두 플러그인의 역할 분담"
    - **Authentication**: "너 누구야?" — 인증서로 신원 자체를 검증. 통과 못 하면 아예 네트워크 참여 불가. **가짜(신원 위조) 노드**를 막는 1차 방어선.
    - **Access Control**: "넌 이거 할 권한 있어?" — 신원은 확인됐지만, Permissions 파일 기준으로 특정 Topic Pub/Sub이 허용되는지 검사. **진짜지만 권한 없는 노드**의 월권을 막는 2차 방어선.

```
가짜 노드(공격자)가 /cmd_vel에 위험 명령 발행 시도

1차 방어: Authentication
  → 공격자 노드는 Identity CA가 서명한 인증서가 없음
  → Discovery 단계에서 신원 검증 실패 → 통신 자체가 수립 안 됨

2차 방어: Access Control (만약 인증은 통과했다면)
  → 인증서는 있지만 /cmd_vel 발행 권한이 없는 노드라면
  → Permissions 파일에서 거부되어 발행 차단
```

---

## SROS2 keystore 생성, 노드별 권한 설정

**SROS2**는 ROS2에서 DDS Security를 쉽게 설정할 수 있도록 만든 도구 모음이다.

### Keystore 생성

```bash
ros2 security create_keystore ~/sros2_keystore

sros2_keystore/
├── private/           # CA 개인키
├── public/            # CA 인증서
├── enclaves/          # 노드별 보안 설정
└── ...
```

### Enclave 개념

SROS2에서 **Enclave**는 하나의 보안 정체성 단위다. 보통 노드 1개 또는 노드 그룹에 대응한다.

```bash
ros2 security create_key ~/sros2_keystore /talker_node
ros2 security create_key ~/sros2_keystore /listener_node
```

```
enclaves/talker_node/
├── cert.pem           # 이 노드의 인증서
├── key.pem            # 이 노드의 개인키
├── governance.p7s     # 도메인 전체 보안 정책 (서명됨)
└── permissions.p7s    # 이 노드의 권한 정책 (서명됨)
```

### Permissions 파일로 권한 제한

```xml
<!-- permissions.xml -->
<permissions>
  <grant name="talker_permissions">
    <subject_name>CN=talker_node</subject_name>
    <validity>
      <not_before>2026-01-01T00:00:00</not_before>
      <not_after>2030-01-01T00:00:00</not_after>
    </validity>
    <allow_rule>
      <publish>
        <topics><topic>/cmd_vel</topic></topics>
      </publish>
    </allow_rule>
    <deny_rule>
      <subscribe>
        <topics><topic>/*</topic></topics>
      </subscribe>
    </deny_rule>
  </grant>
</permissions>
```

```
의미: talker_node는
  - /cmd_vel 토픽만 발행 가능
  - 어떤 토픽도 구독 불가 (명시적 거부)
  - 다른 모든 동작은 기본 거부 (화이트리스트 방식)
```

### 보안 활성화

```bash
export ROS_SECURITY_KEYSTORE=~/sros2_keystore
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce

ros2 run my_pkg talker_node --ros-args --enclave /talker_node
```

---

## 실습: ros2 security CLI

### 전체 워크플로우 정리

```bash
# 1. 키스토어 생성
ros2 security create_keystore ~/demo_keystore

# 2. 노드별 키/인증서 생성
ros2 security create_key ~/demo_keystore /talker
ros2 security create_key ~/demo_keystore /listener

# 3. 권한 파일 생성 (기본 템플릿)
ros2 security create_permission ~/demo_keystore /talker policy.xml

# 4. 환경변수 설정 후 실행
export ROS_SECURITY_KEYSTORE=~/demo_keystore
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce

ros2 run demo_nodes_cpp talker --ros-args --enclave /talker
ros2 run demo_nodes_cpp listener --ros-args --enclave /listener
```

### 보안 미적용 노드가 끼어들면?

```
시나리오: 인증서 없는 외부 노드가 같은 Domain에 접속 시도

Authentication 단계에서 거부
  → Identity CA로 서명되지 않은 인증서 → 신뢰 체인 검증 실패
  → 해당 노드와의 통신 자체가 수립되지 않음
  → "도청"이나 "위장 발행자" 공격 차단
```

### ROS_SECURITY_STRATEGY 옵션

| 값 | 동작 |
|----|------|
| `Enforce` | 보안 설정 안 된 노드는 통신 자체를 거부 |
| `Permissive` | 보안 설정이 없으면 평문(비보안)으로 폴백 허용 |

> 운영 환경에서는 `Enforce`, 개발/디버깅 중에는 `Permissive`로 점진적 적용하는 게 일반적이다.

---

## 보안 위협 모델과 플러그인 매핑

| 위협 | 대응 플러그인 |
|------|---------------|
| 위장 노드가 가짜 명령 발행 (Spoofing) | Authentication |
| 권한 없는 노드가 민감 토픽 구독 (도청) | Access Control |
| 네트워크 스니핑으로 패킷 내용 탈취 | Cryptographic |
| 보안 사고 후 원인 추적 불가 | Logging |
| 민감도가 다른 데이터가 섞여서 유출 | Data Tagging |

---

## 핵심 개념 정리

!!! tip "세션 9 핵심 3가지"
    1. **DDS Security = 5개 플러그인** (Authentication, Access Control, Cryptographic, Logging, Data Tagging)
    2. **SROS2 Keystore + Enclave**로 노드별 인증서·권한을 관리
    3. **Permissions 파일은 화이트리스트 방식** — 명시적으로 허용한 것만 가능, 나머지는 기본 거부

---

## 복습 (15분)

!!! question "Q1"
    가짜 노드가 `/cmd_vel`에 위험한 명령을 발행하려는 공격을 막으려면 어떤 플러그인이 필요한가?

??? success "정답"
    1차 방어는 **Authentication**이다. 신원 위조된 가짜 노드는 인증서 검증 단계에서 막혀 통신 자체가 수립되지 않는다. 만약 인증은 통과했지만 권한이 없는 경우라면 **Access Control**이 2차로 발행을 차단한다.

!!! question "Q2"
    Access Control과 Authentication의 역할 차이는?

??? success "정답"
    - **Authentication**: 신원 자체를 검증 — 통과 못 하면 네트워크 참여 불가
    - **Access Control**: 신원은 확인됐지만 특정 행동(Topic Pub/Sub)에 대한 권한이 있는지 검사

!!! question "Q3"
    `ROS_SECURITY_STRATEGY=Permissive`와 `Enforce`의 차이는?

??? success "정답"
    `Enforce`는 보안 설정이 안 된 노드와의 통신을 아예 거부하고, `Permissive`는 보안 설정이 없으면 평문(비보안) 통신으로 폴백을 허용한다.

!!! question "Q4"
    Permissions 파일이 "화이트리스트 방식"이라는 것은 무슨 의미인가?

??? success "정답"
    명시적으로 허용한 행동(특정 Topic의 Pub/Sub)만 가능하고, 나머지 모든 행동은 기본적으로 거부된다는 의미다.

---

## 다음 세션 예고

**세션 10: 전체 통합 & 실전 시나리오**

- 전체 개념 지도 리뷰
- 자율주행 로봇 함대 네트워크 설계
- 성능 튜닝과 Discovery Server
