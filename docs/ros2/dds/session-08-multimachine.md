# 세션 8: 멀티머신 ROS2 네트워킹

!!! info "세션 정보"
    - **학습 시간**: 2시간 (학습 1h 45m + 복습 15m)
    - **핵심 목표**: 실전 환경(같은 서브넷/다른 서브넷/VPN)에서 ROS2 멀티머신 통신 구성 및 트러블슈팅
    - **관련 표준**: RTPS Discovery, 방화벽/네트워크 설정

---

## 한 줄 요약

> 같은 서브넷이면 멀티캐스트가 막혀있지 않은 한 자동 발견되고, 다른 서브넷·VPN·클라우드에서는 멀티캐스트가 라우터를 넘지 못하므로 **Initial Peers**가 필수다. 문제가 생기면 `ros2 topic info --verbose`로 QoS부터, Wireshark로 패킷 흐름을 확인한다.

---

## 같은 서브넷: 멀티캐스트만 되면 자동 발견

### 가장 간단한 케이스: 같은 공유기/스위치

```
PC A (192.168.1.10) ── 같은 와이파이 ──  PC B (192.168.1.20)
   │                                          │
   └── ROS_DOMAIN_ID=0                       └── ROS_DOMAIN_ID=0

→ 멀티캐스트가 막혀있지 않다면 추가 설정 없이 자동 발견됨
→ ros2 topic list 하면 양쪽 노드가 서로 보임
```

### 체크리스트

```bash
# 1. 같은 Domain ID 확인
echo $ROS_DOMAIN_ID   # 양쪽 PC에서 동일해야 함

# 2. 멀티캐스트 가능 여부 테스트
ping 239.255.0.1      # 응답 안 와도 정상 (멀티캐스트는 ping 응답 없음)

# 3. 방화벽 확인 (Ubuntu 기준)
sudo ufw status
sudo ufw allow 7400:7500/udp
```

### 흔한 실패 원인

```
공유기 설정에 "AP Isolation(클라이언트 격리)"이 켜져 있으면
→ 같은 와이파이에 붙어도 기기끼리 서로 통신 불가
→ 카페/회사 와이파이에서 자주 발생하는 문제
→ 가정용 공유기에서도 게스트 네트워크는 기본적으로 격리됨
```

!!! tip "노드가 안 보일 때 1순위 점검"
    Domain ID가 같은지 확인 + AP Isolation/방화벽이 멀티캐스트를 막고 있지 않은지 함께 의심해야 한다.

---

## 다른 서브넷/VPN: Initial Peers + 유니캐스트 설정

### 다른 서브넷이면 왜 안 되는가?

```
PC A: 192.168.1.10/24  (서브넷 1)
PC B: 10.0.0.20/24     (서브넷 2)

→ 멀티캐스트는 기본적으로 같은 서브넷(L2) 안에서만 전파됨
→ 라우터가 멀티캐스트를 다음 서브넷으로 전달하지 않으면 (기본값이 보통 차단)
→ SPDP 패킷이 상대방에게 절대 도달 못 함
```

### 해결: 세션 7의 Initial Peers 적용

```xml
<participant profile_name="cross_subnet" is_default_profile="true">
  <rtps>
    <builtin>
      <initialPeersList>
        <locator>
          <udpv4>
            <address>10.0.0.20</address>
            <port>7400</port>
          </udpv4>
        </locator>
      </initialPeersList>
      <metatrafficMulticastLocatorList/>
    </builtin>
  </rtps>
</participant>
```

```bash
export FASTRTPS_DEFAULT_PROFILES_FILE=/home/user/cross_subnet.xml
export ROS_DOMAIN_ID=0
ros2 run my_pkg my_node
```

### VPN 환경 (예: WireGuard, Tailscale)

```
VPN 터널은 일반적으로 유니캐스트 P2P 구조
→ 멀티캐스트 자체가 터널을 통과하지 못함
→ 무조건 Initial Peers 방식 필요

VPN 연결 후 할당된 가상 IP를 Initial Peers에 등록
  PC A 가상 IP: 100.64.0.1
  PC B 가상 IP: 100.64.0.2
  → 서로의 가상 IP를 initialPeersList에 추가
```

---

## 방화벽 포트 규칙, Wireshark 디버깅

### 필요한 포트 규칙

```
SPDP/SEDP 발견 포트 (세션 6 공식 적용)
  7400 + 250×DomainID         (SPDP 멀티캐스트)
  7400 + 250×DomainID + 1     (SPDP 유니캐스트)

데이터 전송 포트 (Ephemeral, 동적 할당)
  Linux 기본: 32768~60999
```

```bash
sudo ufw allow 7400:7500/udp        # Discovery 포트 범위
sudo ufw allow 32768:60999/udp      # 데이터 전송 (ephemeral)
```

### Wireshark로 RTPS 디버깅

```
1. 필터: rtps 또는 udp.port == 7400

2. 확인할 것
   - SPDP 패킷이 실제로 나가는지 (Source IP 확인)
   - 상대방이 응답하는지 (양방향 패킷 흐름)
   - GuidPrefix로 어느 노드의 패킷인지 식별

3. 흔한 증상별 진단
   SPDP는 보이는데 SEDP가 없음
     → Discovery는 됐지만 Topic 정보 교환 실패 → QoS 불일치 의심

   SPDP 자체가 안 보임
     → 멀티캐스트 라우팅 문제 또는 방화벽 차단 → Initial Peers로 전환 필요

   패킷은 오가는데 ros2 topic echo 안 됨
     → QoS 호환성 문제 (Reliability/Durability 불일치)
```

### 트러블슈팅 명령어 모음

```bash
ros2 node list
ros2 topic list
ros2 topic info /my_topic --verbose   # 연결 안 될 때 가장 먼저 볼 것

echo $ROS_DOMAIN_ID
echo $RMW_IMPLEMENTATION
echo $FASTRTPS_DEFAULT_PROFILES_FILE

ip addr show   # 멀티 인터페이스 환경에서 확인
```

---

## 멀티머신 네트워킹 전체 의사결정 트리

```
같은 서브넷인가?
├─ YES → 멀티캐스트 막혀있나? (AP Isolation, 방화벽)
│         ├─ NO → 기본 설정으로 자동 동작 ✓
│         └─ YES → 방화벽 해제 또는 Initial Peers
│
└─ NO (다른 서브넷/VPN/클라우드)
          → Initial Peers 필수
          → 노드 수가 많아지면 → Discovery Server 고려 (세션 10)
```

---

## 핵심 개념 정리

!!! tip "세션 8 핵심 3가지"
    1. **같은 서브넷**: 멀티캐스트만 안 막혀있으면 자동 발견
    2. **다른 서브넷/VPN**: 멀티캐스트가 라우터를 못 넘으므로 Initial Peers 필수
    3. **트러블슈팅 우선순위**: `ros2 topic info --verbose`로 QoS 먼저 확인, Wireshark로 패킷 흐름 확인

---

## 복습 (15분)

!!! question "Q1"
    같은 와이파이에 있는데도 두 PC의 ROS2 노드가 서로 안 보일 때, 가장 먼저 의심해야 할 것은?

??? success "정답"
    Domain ID가 같은지 확인하는 것이 1순위다. 추가로 와이파이의 AP Isolation(클라이언트 격리)이 켜져 있는지도 함께 의심해야 한다 — 같은 SSID에 붙어있어도 기기끼리 통신이 차단되는 경우가 흔하다.

!!! question "Q2"
    멀티캐스트가 다른 서브넷으로 전파되지 않는 이유는?

??? success "정답"
    멀티캐스트는 기본적으로 같은 서브넷(L2) 안에서만 전파되며, 라우터가 기본 설정상 멀티캐스트를 다음 서브넷으로 전달하지 않기 때문이다.

!!! question "Q3"
    `ros2 topic echo`가 아무 데이터도 안 보여줄 때 (SPDP/SEDP는 정상으로 보일 때) 가장 먼저 확인할 것은?

??? success "정답"
    QoS 호환성 문제(Reliability/Durability 불일치)를 확인한다. Discovery는 정상이라는 뜻이므로 남은 원인은 거의 항상 QoS다.

!!! question "Q4"
    VPN 환경에서 ROS2 멀티머신 통신을 설정할 때 왜 Initial Peers가 필수인가?

??? success "정답"
    VPN 터널이 유니캐스트 P2P 구조라 멀티캐스트가 터널을 통과하지 못하기 때문에, 상대방의 VPN 가상 IP를 Initial Peers에 직접 등록해야 한다.

---

## 다음 세션 예고

**세션 9: 보안 — ROS2 Security (SROS2)**

- DDS Security 5가지 플러그인
- SROS2 keystore, Enclave, Permissions 파일
