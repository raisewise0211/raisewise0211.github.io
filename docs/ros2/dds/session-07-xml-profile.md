# 세션 7: DDS 설정 파일 (XML Profile)

!!! info "세션 정보"
    - **학습 시간**: 2시간 (학습 1h 45m + 복습 15m)
    - **핵심 목표**: XML 프로파일로 QoS·전송·Discovery를 코드 수정 없이 제어
    - **관련 표준**: Fast DDS XML Profiles, CycloneDDS URI Config

---

## 한 줄 요약

> 환경변수만으로 부족한 세밀한 제어(QoS, 멀티캐스트 비활성화, Initial Peers)는 **XML 프로파일 파일**로 설정하며, 클라우드/VPN처럼 멀티캐스트가 막힌 환경에서는 필수다.

---

## FASTRTPS_DEFAULT_PROFILES_FILE, XML 구조

### Fast DDS XML 프로파일 활성화

```bash
export FASTRTPS_DEFAULT_PROFILES_FILE=/path/to/my_profile.xml
```

이 환경변수를 지정하면 Fast DDS는 시작 시 해당 XML을 읽어서 QoS, 전송, Discovery 설정을 덮어쓴다.

### XML 기본 구조

```xml
<?xml version="1.0" encoding="UTF-8"?>
<dds xmlns="http://www.eprosima.com/XMLSchemas/fastRTPS_Profiles">

  <profiles>
    <!-- Participant(노드) 단위 설정 -->
    <participant profile_name="my_participant" is_default_profile="true">
      <rtps>
        <builtin>
          <!-- Discovery 관련 설정 -->
        </builtin>
      </rtps>
    </participant>

    <!-- Publisher(DataWriter) 단위 설정 -->
    <data_writer profile_name="my_writer">
      <qos>
        <reliability><kind>RELIABLE</kind></reliability>
        <durability><kind>TRANSIENT_LOCAL</kind></durability>
      </qos>
    </data_writer>

    <!-- Subscriber(DataReader) 단위 설정 -->
    <data_reader profile_name="my_reader">
      <qos>
        <reliability><kind>RELIABLE</kind></reliability>
      </qos>
    </data_reader>
  </profiles>

</dds>
```

### 프로파일 적용 범위

```
is_default_profile="true"
  → 코드에서 별도 지정 없이 모든 Participant/Writer/Reader에 자동 적용

profile_name 지정 후 코드에서 명시적으로 선택
  → 특정 노드만 다른 설정 적용 가능 (세밀한 제어)
```

> XML 설정은 **코드 변경 없이** QoS, 전송 방식, Discovery 동작을 통째로 바꿀 수 있다는 게 핵심 장점이다.

---

## 유니캐스트 전용 설정 (멀티캐스트 비활성화)

클라우드, VPN, 쿠버네티스 같은 환경에서는 **멀티캐스트가 막혀있는 경우가 대부분**이다. 이때 SPDP가 동작하지 않으므로 강제로 유니캐스트만 쓰도록 설정해야 한다.

### 멀티캐스트 비활성화 XML

```xml
<participant profile_name="unicast_only" is_default_profile="true">
  <rtps>
    <builtin>
      <discovery_config>
        <use_SIMPLE_EndpointDiscoveryProtocol>true</use_SIMPLE_EndpointDiscoveryProtocol>
      </discovery_config>

      <metatrafficUnicastLocatorList>
        <locator>
          <udpv4>
            <port>7400</port>
          </udpv4>
        </locator>
      </metatrafficUnicastLocatorList>

      <metatrafficMulticastLocatorList/>  <!-- 멀티캐스트 비움 -->
    </builtin>
  </rtps>
</participant>
```

### 왜 이게 필요한가?

```
클라우드 환경의 일반적 제약:
  - Kubernetes Pod 간 멀티캐스트 라우팅 미지원이 흔함
  - VPN 터널은 대부분 유니캐스트만 통과
  - 클라우드 VPC는 보안상 멀티캐스트 차단이 기본값

→ 멀티캐스트 SPDP가 동작 안 하면 노드끼리 서로 발견 자체가 안 됨
→ 유니캐스트로 강제 전환 + Initial Peers로 상대 주소 직접 지정 필요
```

---

## Initial Peers 설정

멀티캐스트가 안 되는 환경에서, 자동 발견 대신 **상대방 주소를 미리 알려주는 방법**이 Initial Peers다.

### Initial Peers XML 설정

```xml
<participant profile_name="initial_peers_config" is_default_profile="true">
  <rtps>
    <builtin>
      <initialPeersList>
        <locator>
          <udpv4>
            <address>192.168.1.100</address>
            <port>7400</port>
          </udpv4>
        </locator>
        <locator>
          <udpv4>
            <address>192.168.1.101</address>
            <port>7400</port>
          </udpv4>
        </locator>
      </initialPeersList>
    </builtin>
  </rtps>
</participant>
```

### 동작 원리

```
멀티캐스트 SPDP (기존 방식)
  내 노드 → 239.255.0.1로 브로드캐스트 → 모두가 듣고 응답

Initial Peers (유니캐스트 SPDP)
  내 노드 → 명시된 IP 리스트로 직접 PDP 메시지 전송
  → 192.168.1.100:7400 에게 직접 "나 여기 있어" 전송
  → 192.168.1.101:7400 에게도 동일하게 전송
  → 각 피어가 응답하며 Discovery 진행
```

### 장단점

| 항목 | 멀티캐스트 | Initial Peers (유니캐스트) |
|------|-----------|---------------------------|
| 설정 난이도 | 낮음 (자동) | 높음 (IP 직접 명시) |
| 새 노드 추가 | 자동 발견 | XML에 IP 추가 필요 |
| 클라우드/VPN 호환 | 대부분 불가 | 가능 |
| 네트워크 트래픽 | 효율적 (1:N) | 노드 수만큼 증가 (1:1 반복) |

!!! warning "노드가 많아지면 관리 부담 증가"
    노드 10대를 추가하면 XML의 `initialPeersList`에 IP 10개를 일일이 추가해야 한다. 이 문제는 세션 10에서 다룬 **Discovery Server**로 해결한다.

### CycloneDDS의 동일 설정 (참고)

```xml
<CycloneDDS>
  <Domain>
    <General>
      <Interfaces>
        <NetworkInterface address="192.168.1.100"/>
      </Interfaces>
      <AllowMulticast>false</AllowMulticast>
    </General>
    <Discovery>
      <Peers>
        <Peer address="192.168.1.101"/>
      </Peers>
    </Discovery>
  </Domain>
</CycloneDDS>
```

```bash
export CYCLONEDDS_URI=file:///path/to/cyclonedds.xml
```

---

## 핵심 개념 정리

!!! tip "세션 7 핵심 3가지"
    1. **XML Profile**: 코드 수정 없이 QoS/전송/Discovery를 통째로 설정 (`FASTRTPS_DEFAULT_PROFILES_FILE`)
    2. **멀티캐스트 비활성화**: 클라우드/VPN 환경에서 SPDP 자동 발견이 막히므로 필수
    3. **Initial Peers**: 상대 IP를 명시해 유니캐스트로 Discovery — 멀티캐스트 대체 수단

---

## 복습 (15분)

!!! question "Q1"
    `FASTRTPS_DEFAULT_PROFILES_FILE` 환경변수의 역할은?

??? success "정답"
    이 환경변수에 지정된 경로의 XML 파일을 Fast DDS가 시작 시 읽어서 QoS·전송·Discovery 설정을 덮어쓴다.

!!! question "Q2"
    클라우드/Kubernetes 환경에서 멀티캐스트 기반 SPDP가 동작하지 않는 이유는?

??? success "정답"
    Pod 간 네트워크가 가상화된 오버레이 구조라 멀티캐스트 라우팅을 기본 지원하지 않고, VPC 보안 정책상 브로드캐스트성 트래픽을 차단하는 게 일반적이기 때문이다.

!!! question "Q3"
    Initial Peers 방식과 멀티캐스트 방식의 가장 큰 트레이드오프는?

??? success "정답"
    멀티캐스트는 자동 발견이 가능하지만 클라우드/VPN에서 막히는 경우가 많고, Initial Peers는 상대 IP를 미리 알아서 명시해야 하지만 그런 환경에서도 동작한다.

!!! question "Q4"
    새로운 노드 10대를 클라우드에 추가로 배포할 때, Initial Peers 방식의 단점은 무엇인가?

??? success "정답"
    XML의 `initialPeersList`에 새 노드의 IP를 일일이 수동으로 추가해야 한다. 노드가 동적으로 늘고 줄어드는 환경(오토스케일링 등)에서는 관리가 어려워지며, 이는 Discovery Server로 해결할 수 있다.

---

## 다음 세션 예고

**세션 8: 멀티머신 ROS2 네트워킹**

- 같은 서브넷 vs 다른 서브넷/VPN 통신 구성
- 방화벽 포트 규칙, Wireshark 디버깅
