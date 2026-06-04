# MQTT Bridge & 정보 집계

!!! info "패키지 정보"
    - **패키지**: `isaac_ros_mqtt_bridge` (Python), `isaac_ros_json_info_generator` (Python)
    - **역할**: 클라우드(MQTT) ↔ 로봇(ROS) 메시지 변환, 토픽 정보 집계
    - **노드**: `MqttRosBridgeNode`, `JsonInfoGeneratorNode`
    - **핵심 의존성**: `paho-mqtt`, `rosbridge_library`, `vda5050_msgs`

---

## 한 줄 요약

> VDA5050 메시지를 **MQTT(dromedaryCase JSON) ↔ ROS(snake_case 메시지)** 양방향으로 변환하고, TLS·자동 재연결·LWT를 처리하는 게이트웨이. JSON Info Generator는 여러 ROS 토픽을 모아 상태 보고에 실어 보낸다.

---

## isaac_ros_mqtt_bridge

### 패키지 개요

| 항목 | 내용 |
|------|------|
| 역할 | MQTT 브로커와 Mission Client 사이의 프로토콜 어댑터 |
| MQTT 라이브러리 | `paho.mqtt.client` (MQTTv311), tcp/websockets transport |
| 메시지 변환 | `rosbridge_library`의 `message_conversion`/`ros_loader`로 ROS↔dict 동적 변환 |
| 토픽 형식 | `{interface_name}/{major_version}/{manufacturer}/{serial_number}/{channel}` |

### 파일 구조

```
isaac_ros_mqtt_bridge/
├── isaac_ros_mqtt_bridge/
│   ├── MqttRosBridgeNode.py    # ★ 양방향 브릿지 본체
│   └── MqttBridgeUtils.py      # case 변환 + ConnectionMessage + State enum
└── test/
    ├── base_mqtt_bridge_test.py
    ├── test_mqtt_bridge_tcp.py
    ├── test_mqtt_bridge_websocket.py
    └── test_string_conversion.py
```

### 토픽 매핑

```
   ☁️ MQTT 브로커                          🤖 ROS (Mission Client)

   .../order          ──camel→snake──▶   client_commands (Order)
   .../instantActions ──camel→snake──▶   instant_actions_commands (InstantActions)

   .../state          ◀──snake→camel──   agv_state (AGVState)
   .../factsheet      ◀──snake→camel──   factsheet (Factsheet)
   .../visualization  ◀──snake→camel──   (state에서 위치/속도 추출해 생성)
   .../connection     ◀── ConnectionMessage (ONLINE/OFFLINE/CONNECTIONBROKEN)
```

### MqttRosBridgeNode.py — 동작

#### 초기화 (`__init__`)

```
1. 파라미터 선언 (mqtt_host/port/transport, manufacturer, serial_number,
   TLS 설정, 재연결 설정, ros_subscriber/publisher_type 등)
2. mqtt.Client 생성 (client_id = serial_number)
3. _setup_mqtt_connection (username/pw, websocket path)
4. mqtt_tls_enabled 면 _setup_tls (SSLContext, min TLS 버전, cert chain)
5. topic prefix 구성
6. 콜백 등록 (on_connect/on_disconnect/on_message/on_subscribe)
7. ROS publisher/subscriber 생성
8. _connect_mqtt_broker (재연결 루프)
```

#### 핵심 메서드

| 메서드 | 방향 | 동작 |
|--------|------|------|
| `_handle_mqtt_message` | MQTT→ROS | `order`: 기본값 채움(`_set_default_values`) → camel→snake → `Order` 발행. `instantActions`: → `InstantActions` 발행 |
| `_handle_state_message` | ROS→MQTT | `AGVState` → dict 추출 → snake→camel → `.../state` publish + `_publish_visualization` |
| `_handle_factsheet_message` | ROS→MQTT | `Factsheet` → `.../factsheet` publish |
| `_publish_visualization` | ROS→MQTT | 마지막 state에서 위치·속도 뽑아 `Visualization` 생성 → `.../visualization` |
| `_on_mqtt_connect` | — | 연결 성공 시 `.../order`, `.../instantActions` 구독 + connection ONLINE publish |
| `_connect_mqtt_broker` | — | 지수 백오프 재연결(`base_delay * 2^retries`, max 60s), `retry_forever` 지원 |
| `_reconnect_worker` | — | 끊김 시 별도 데몬 스레드에서 재연결 (`_reconnect_lock`으로 중복 방지) |

#### 견고성(robustness) 장치

- **LWT (Last Will and Testament)**: `will_set`으로 `.../connection`에 `CONNECTIONBROKEN`을 예약 → 비정상 종료 시 브로커가 대신 알림
- **자동 재연결**: `on_disconnect`에서 비정상(rc≠0)이면 데몬 스레드로 지수 백오프 재시도
- **`_mqtt_ready` 가드**: 연결 전 ROS→MQTT 발행 시도를 막음
- **TLS**: `SSLContext` 최소 버전(tlsv1.2/1.3), cert chain, `mqtt_tls_insecure`로 검증 우회 옵션

### MqttBridgeUtils.py — case 변환

VDA5050 JSON은 **dromedaryCase**, ROS 메시지는 **snake_case**. 양방향 변환을 담당.

| 함수 | 동작 |
|------|------|
| `convert_camel_to_snake` | 정규식 `(?<!^)(?=[A-Z])`로 대문자 앞에 `_` 삽입 후 소문자화 |
| `convert_snake_to_camel(s, dromedary)` | `_` 분리 후 단어별 대문자화. `dromedary=True`면 첫 단어만 소문자 시작 |
| `convert_dict_keys(d, mode)` | dict/list 재귀 적용 (`snake_to_dromedary`/`snake_to_camel`/`camel_to_snake`) |
| `class State(Enum)` | `ONLINE`/`OFFLINE`/`CONNECTIONBROKEN` |
| `class ConnectionMessage` | VDA5050 connection 메시지(headerId 카운터, timestamp, version 2.1.0) → `__str__`로 JSON |

```python
# 예시
convert_camel_to_snake("orderId")        # → "order_id"
convert_snake_to_camel("order_id", True) # → "orderId"  (dromedary)
convert_snake_to_camel("order_id", False)# → "OrderId"  (camel)
```

### MqttRosBridgeNode 연계 도식도

```
   MqttBridgeUtils.py                       MqttRosBridgeNode.py
   ┌──────────────────────┐                ┌──────────────────────────────────────────┐
   │ class State (enum)    │                │ __init__: 파라미터·mqtt.Client·TLS·콜백·    │
   │ class ConnectionMessage│◀──── uses ─────│   pub/sub 등록, topic prefix 구성           │
   │ convert_camel_to_snake │                │                                            │
   │ convert_snake_to_camel │◀──── uses ─────│ [MQTT→ROS] on_message → _handle_mqtt_message│
   │ convert_dict_keys      │                │   order → Order, instantActions → InstantA. │
   └──────────────────────┘                │ [ROS→MQTT] _handle_state_message            │
                                            │   AGVState → state + _publish_visualization │
                                            │   _handle_factsheet_message → factsheet     │
                                            │ on_disconnect → 데몬 스레드 지수백오프 재연결 │
                                            │ will(LWT) → CONNECTIONBROKEN                 │
                                            └──────────────────────────────────────────┘
```

### 주요 파라미터

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `mqtt_host_name` | `localhost` | 브로커 주소 |
| `mqtt_port` | `1883` | 브로커 포트 |
| `mqtt_transport` | `tcp` | `tcp` / `websockets` |
| `interface_name` / `major_version` | `uagv` / `v2` | 토픽 prefix 구성 |
| `manufacturer` / `serial_number` | `RobotCompany` / `carter01` | 토픽 prefix + client_id |
| `convert_case` | `true` | camel↔snake 변환 사용 |
| `ros_publisher_type` | `vda5050_msgs/Order` | MQTT order → 변환할 ROS 타입 |
| `ros_subscriber_type` | `vda5050_msgs/AGVState` | ROS state → MQTT 변환 타입 |
| `mqtt_tls_enabled` | `false` | TLS 사용 |
| `retry_forever` / `num_retries` | `false` / `10` | 재연결 정책 |

---

## isaac_ros_json_info_generator { #json-info-generator }

### 패키지 개요

| 항목 | 내용 |
|------|------|
| 역할 | 임의의 ROS 토픽들을 모아 JSON으로 직렬화 → `info` 토픽으로 Mission Client에 전달 |
| 노드 | `JsonInfoGeneratorNode` |
| 용도 | 디버그·시각화 정보를 AGVState의 `informations`에 실어 클라우드로 전달 |

### 동작

```
__init__:
  파라미터: ros_subscriber_types[], ros_subscriber_topics[] (길이 동일),
            messages_aggregated_count(버퍼 크기), update_period
  order_id 구독 (order 바뀌면 버퍼 리셋)
  각 (type, topic) 쌍마다 구독 생성 → messages[topic] = deque(maxlen=N)
  update_period 마다 timer → info 발행

__ros_subscriber_callback(topic):
  메시지 도착 → extract_values(dict) → messages[topic] 에 append
  (deque가 messages_aggregated_count 초과 시 popleft)

__order_id_callback:
  새 order_id 면 messages = {} 로 초기화 (이전 주문 정보 제거)

__timer_callback:
  deque → list 변환 → json.dumps({topic: [msgs]}) → 'info' 토픽 발행
```

→ Mission Client의 `InfoCallback`이 이 문자열을 받아 `AGVState.informations`에 실어 발행하고, mqtt_bridge가 `.../state`로 클라우드에 전달한다.

### 데이터 흐름

```
   여러 ROS 토픽 (data1, data2, ...)
        │ 구독
        ▼
   JsonInfoGeneratorNode
   ├─ messages[topic] = deque(maxlen=N)   (토픽별 최근 N개 버퍼)
   ├─ order_id 변경 시 버퍼 리셋
   └─ timer(update_period): JSON 직렬화 → 'info' 발행
        │
        ▼
   Mission Client.InfoCallback → AGVState.informations
        │
        ▼
   mqtt_bridge → MQTT .../state → ☁️ 클라우드
```

---

## 참고 자료 (References)

1. **Eclipse Paho MQTT Python** — MQTT 클라이언트 라이브러리.
   [https://www.eclipse.org/paho/index.php?page=clients/python/index.php](https://www.eclipse.org/paho/index.php?page=clients/python/index.php)
2. **rosbridge_suite (rosbridge_library)** — ROS 메시지 ↔ dict/JSON 동적 변환.
   [https://github.com/RobotWebTools/rosbridge_suite](https://github.com/RobotWebTools/rosbridge_suite)
3. **VDA5050 프로토콜 명세** — connection/state/visualization 메시지 정의.
   [https://github.com/VDA5050/VDA5050/blob/main/VDA5050_EN.md](https://github.com/VDA5050/VDA5050/blob/main/VDA5050_EN.md)

!!! note "출처"
    본문은 `isaac_ros_mqtt_bridge`, `isaac_ros_json_info_generator` 패키지 (Isaac ROS 4.4.0 기준) 소스코드 분석에 기반한다.
