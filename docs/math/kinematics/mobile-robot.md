# 모바일 로봇 기구학

> **참고**: 이 페이지는 [ROS2 Controllers - Mobile Robot Kinematics](https://control.ros.org/rolling/doc/ros2_controllers/doc/mobile_robot_kinematics.html)와 Siciliano et al. *Robotics: Modelling, Planning and Control*, Lynch & Park *Modern Robotics*를 기반으로 한다.

---

## 좌표계와 표기법

모바일 로봇 기구학에서는 두 좌표계를 다룬다:

- **월드 프레임** \(\{W\}\): 고정된 전역 좌표계
- **바디 프레임** \(\{B\}\): 로봇 본체에 고정된 좌표계

로봇의 **body twist** (바디 프레임 기준 속도)는 다음으로 표현된다:

\[
\mathbf{v}_b = \begin{bmatrix} v_{b,x} \\ v_{b,y} \\ \omega_{b,z} \end{bmatrix}
\]

- \(v_{b,x}\): 전진 속도 (m/s)
- \(v_{b,y}\): 횡방향 속도 (m/s), 비홀로노믹 로봇은 0
- \(\omega_{b,z}\): 로봇의 회전 각속도 (rad/s)

---

## 홀로노믹 vs 비홀로노믹

모바일 로봇은 움직임 자유도에 따라 크게 두 가지로 나뉜다.

| 구분 | 홀로노믹 (Holonomic) | 비홀로노믹 (Nonholonomic) |
|------|---------------------|--------------------------|
| 순간 이동 방향 | 임의 방향 가능 | 제한됨 (구속 조건 있음) |
| 대표 예시 | 옴니휠, 스워브 드라이브 | 차동 구동, 자동차 |
| \(v_{b,y}\) | 0이 아닐 수 있음 | 항상 0 (미끄럼 없음 가정) |

비홀로노믹 로봇은 **롤링 구속 조건(no-slip constraint)**을 갖는다:
바퀴는 자신의 진행 방향 외에는 미끄러지지 않는다.

---

## 비홀로노믹 로봇

### 유니사이클 모델 (Unicycle)

가장 단순한 모바일 로봇 모델. 이동 속도 \(v\)와 회전 속도 \(\omega\)로 제어한다.

**순기구학** (바디 속도 → 월드 프레임 속도):

\[
\dot{x} = v_{b,x} \cos\theta, \quad
\dot{y} = v_{b,x} \sin\theta, \quad
\dot{\theta} = \omega_{b,z}
\]

여기서 \(\theta\)는 로봇의 헤딩 각도(월드 프레임 기준).

유니사이클 모델은 추상적인 모델이다. 실제 로봇에서는 아래의 차동 구동처럼 구체적인 구현이 필요하다.

---

### 차동 구동 (Differential Drive)

<figure markdown>
  <figcaption>두 바퀴를 독립적으로 제어해 전진과 회전을 동시에 구현한다.</figcaption>
</figure>

좌우 바퀴의 선속도를 각각 \(v_l\), \(v_r\)이라 하고, 바퀴 간 거리(track width)를 \(w\)라 하면:

**순기구학** (바퀴 속도 → 바디 속도):

\[
v_{b,x} = \frac{v_r + v_l}{2}, \quad
\omega_{b,z} = \frac{v_r - v_l}{w}
\]

**역기구학** (바디 속도 → 바퀴 속도):

\[
v_l = v_{b,x} - \omega_{b,z} \frac{w}{2}, \quad
v_r = v_{b,x} + \omega_{b,z} \frac{w}{2}
\]

차동 구동은 유니사이클 모델의 대표적인 구현체다.
\(v_r = v_l\)이면 직진, \(v_r = -v_l\)이면 제자리 회전이다.

**자코비안 표현**:

\[
\begin{bmatrix} v_{b,x} \\ \omega_{b,z} \end{bmatrix}
= \underbrace{\begin{bmatrix} 1/2 & 1/2 \\ -1/w & 1/w \end{bmatrix}}_{J}
\begin{bmatrix} v_l \\ v_r \end{bmatrix}
\]

역기구학은 \(J^{-1}\)로 바로 풀린다 (\(J\)가 정방 행렬이고 가역적이므로).

---

### 자전거/차량형 모델 (Car-like / Bicycle)

앞바퀴가 조향(steering)되고, 뒷바퀴가 구동되는 구조.
실제 자동차나 RC카의 기본 모델이다.

**변수 정의**:
- \(l\): 축간 거리 (wheelbase)
- \(\phi\): 조향각 (steering angle)
- \(v_{b,x}\): 뒷바퀴 선속도

**순기구학** (뒷바퀴 기준):

\[
\dot{x} = v_{b,x} \cos\theta, \quad
\dot{y} = v_{b,x} \sin\theta, \quad
\dot{\theta} = \frac{v_{b,x}}{l} \tan\phi
\]

앞바퀴와 뒷바퀴 사이에 **미끄럼 없음 조건**이 적용된다:

\[
v_{\text{rear}} = v_{\text{front}} \cos\phi
\]

**역기구학** (바디 속도 → 조향각 + 바퀴 속도):

\[
\phi = \arctan\!\left(\frac{l \cdot \omega_{b,z}}{v_{b,x}}\right)
\]

- 후륜 구동: \(v_{\text{rear}} = v_{b,x}\)
- 전륜 구동: \(v_{\text{front}} = \dfrac{v_{b,x}}{\cos\phi}\)

!!! note "ICR (Instantaneous Center of Rotation)"
    조향 로봇에서 모든 바퀴의 속도 방향에 수직인 선들은 한 점에서 만난다.
    이 점을 **순간 회전 중심 (ICR)**이라 하며, 회전 반경 \(R_b = l / \tan\phi\)로 결정된다.

---

### 이중 후륜 구동 (Double Traction Axle)

앞바퀴 하나가 조향되고, 뒤에 두 바퀴가 독립적으로 구동되는 구조.

**변수 정의**:
- \(l\): 축간 거리
- \(w_r\): 뒷 트랙 폭
- \(\phi\): 조향각
- 회전 반경: \(R_b = l / \tan\phi\)

회전할 때 안쪽/바깥쪽 뒷바퀴의 속도가 달라야 미끄럼이 없다:

**역기구학** (후륜 각 바퀴 속도):

\[
v_{\text{rear,left}} = v_{b,x} \frac{R_b - w_r/2}{R_b}, \quad
v_{\text{rear,right}} = v_{b,x} \frac{R_b + w_r/2}{R_b}
\]

**순기구학** (오도메트리): 두 바퀴 속도의 평균을 사용한다:

\[
v_{b,x} = \frac{v_{\text{rear,left}} + v_{\text{rear,right}}}{2}
\]

---

### 애커만 조향 (Ackermann Steering)

4륜 차량에서 앞 두 바퀴가 각각 다른 각도로 조향되는 구조.
직선으로 조향하면 바깥쪽 바퀴가 더 큰 원호를 그리므로, 각 바퀴에 다른 조향각을 줘야 미끄럼이 없다.

**변수 정의**:
- \(l\): 축간 거리
- \(w_f\): 앞 트랙 폭 (킹핀 간 거리)
- \(\phi\): 등가 조향각 (명령 조향각)
- \(R_b = l / \tan\phi\): 회전 반경

**역기구학** (앞 좌/우 조향각):

\[
\phi_{\text{left}} = \arctan\!\left(\frac{2l\sin\phi}{2l\cos\phi - w_f \sin\phi}\right)
\]

\[
\phi_{\text{right}} = \arctan\!\left(\frac{2l\sin\phi}{2l\cos\phi + w_f \sin\phi}\right)
\]

직선 주행 시에는 \(\phi_{\text{left}} = \phi_{\text{right}} = \phi\)가 된다.

**순기구학** (오도메트리): 두 조향각의 평균으로 등가 조향각을 추정한다.

---

### 애커만 + 독립 전륜 구동 (Ackermann with Front Traction)

앞 두 바퀴가 조향과 구동을 모두 담당하는 구조.
킹핀(kingpin)과 접지점 사이의 거리 \(d_{kp}\)가 추가로 고려된다.

**회전 반경 계산**:

\[
R_b = \frac{l}{\tan\phi}, \quad
R_{\text{left}} = \frac{l - d_{kp}\sin\phi_{\text{left}}}{\sin\phi_{\text{left}}}, \quad
R_{\text{right}} = \frac{l + d_{kp}\sin\phi_{\text{right}}}{\sin\phi_{\text{right}}}
\]

**속도 제약** (모든 바퀴가 같은 각속도로 ICR 주위를 회전):

\[
\frac{v_{\text{front,left}}}{R_{\text{left}}} = \frac{v_{\text{front,right}}}{R_{\text{right}}} = \frac{v_{b,x}}{R_b}
\]

**역기구학** (앞 좌/우 바퀴 속도):

\[
v_{\text{front,left}} = v_{b,x} \frac{l - d_{kp}\sin\phi_{\text{left}}}{R_b \sin\phi_{\text{left}}}
\]

\[
v_{\text{front,right}} = v_{b,x} \frac{l + d_{kp}\sin\phi_{\text{right}}}{R_b \sin\phi_{\text{right}}}
\]

---

## 홀로노믹 로봇

홀로노믹 로봇은 구속 없이 평면 내 임의 방향으로 즉시 이동할 수 있다.
\(v_{b,y} \neq 0\)이 가능하기 때문에, 역기구학이 더 풍부한 제어 자유도를 제공한다.

---

### 옴니휠 (Omni Wheels)

\(n\)개의 옴니휠이 로봇 중심으로부터 거리 \(R\) 위치에 \(\theta = 2\pi/n\) 간격으로 배치된다.

**변수 정의**:
- \(r\): 바퀴 반경
- \(\gamma\): 첫 번째 바퀴의 x축 기준 각도 오프셋
- \(\omega_i\): \(i\)번째 바퀴의 각속도

**역기구학** (바디 속도 → 각 바퀴 속도):

\[
\omega_i = \frac{1}{r}\left[
  \sin\!\big((i-1)\theta + \gamma\big)\, v_{b,x}
  - \cos\!\big((i-1)\theta + \gamma\big)\, v_{b,y}
  - R\, \omega_{b,z}
\right], \quad i = 1, \ldots, n
\]

행렬 형식으로 쓰면:

\[
\boldsymbol{\omega} = \frac{1}{r} A \, \mathbf{v}_b
\]

여기서 \(A\)는 \(n \times 3\) 행렬이고, 각 행이 위 식의 계수다.

**순기구학** (\(n > 3\)일 때 과결정 시스템): 의사역행렬(pseudoinverse)을 사용한다:

\[
\mathbf{v}_b = r \, A^{\dagger} \boldsymbol{\omega}, \quad A^{\dagger} = A^T(AA^T)^{-1}
\]

!!! tip "3바퀴 옴니의 경우"
    \(n=3\)이면 \(A\)가 정방 행렬이 되어 \(\mathbf{v}_b = r A^{-1} \boldsymbol{\omega}\)로 계산 가능하다.

---

### 스워브 드라이브 (Swerve Drive)

각 모듈이 독립적인 조향 모터와 구동 모터를 갖는 구조 (보통 4모듈).
전방향 이동이 가능하면서도 일반 바퀴를 사용해 구동력이 우수하다.

**좌표 설정** (바디 프레임 중심 기준):

| 모듈 | 위치 \((l_{i,x},\; l_{i,y})\) |
|------|-------------------------------|
| front-left  | \((+l/2,\; +w/2)\) |
| front-right | \((+l/2,\; -w/2)\) |
| rear-left   | \((-l/2,\; +w/2)\) |
| rear-right  | \((-l/2,\; -w/2)\) |

여기서 \(l\)은 축간 거리(wheelbase), \(w\)는 트랙 폭(track width).

**역기구학** (각 모듈의 속도 벡터):

\[
v_{i,x} = v_{b,x} - \omega_{b,z}\, l_{i,y}, \quad
v_{i,y} = v_{b,y} + \omega_{b,z}\, l_{i,x}
\]

각 모듈의 조향각과 구동 속도:

\[
\phi_i = \arctan_2(v_{i,y},\; v_{i,x}), \quad
v_i = \sqrt{v_{i,x}^2 + v_{i,y}^2}
\]

**순기구학** (오도메트리):

\[
v_{b,x} = \frac{1}{4}\sum_{i=1}^{4} v_{i,x}, \quad
v_{b,y} = \frac{1}{4}\sum_{i=1}^{4} v_{i,y}
\]

\[
\omega_{b,z} = \frac{\displaystyle\sum_{i=1}^{4} \left(v_{i,y}\, l_{i,x} - v_{i,x}\, l_{i,y}\right)}{\displaystyle\sum_{i=1}^{4} \left(l_{i,x}^2 + l_{i,y}^2\right)}
\]

**자코비안 관점**: 역기구학을 행렬로 정리하면

\[
\begin{bmatrix} v_{1,x} \\ v_{1,y} \\ \vdots \\ v_{4,x} \\ v_{4,y} \end{bmatrix}
= \underbrace{\begin{bmatrix}
1 & 0 & -l_{1,y} \\
0 & 1 & +l_{1,x} \\
\vdots & \vdots & \vdots \\
1 & 0 & -l_{4,y} \\
0 & 1 & +l_{4,x}
\end{bmatrix}}_{J \in \mathbb{R}^{8 \times 3}}
\begin{bmatrix} v_{b,x} \\ v_{b,y} \\ \omega_{b,z} \end{bmatrix}
\]

순기구학(오도메트리)은 \(J^{\dagger}\)로 계산할 수 있다.

---

## 오도메트리 (Odometric Localization)

모든 기구학 모델은 바퀴 엔코더 데이터를 이용한 **데드 레커닝(dead reckoning)** 기반 위치 추정에 활용된다.

순기구학으로 현재 바디 속도 \(\mathbf{v}_b\)를 계산한 뒤, 적분하여 포즈를 업데이트한다:

\[
\begin{bmatrix} x \\ y \\ \theta \end{bmatrix}_{t+\Delta t}
=
\begin{bmatrix} x \\ y \\ \theta \end{bmatrix}_{t}
+
\begin{bmatrix} v_{b,x}\cos\theta \\ v_{b,x}\sin\theta \\ \omega_{b,z} \end{bmatrix} \Delta t
\]

!!! warning "오도메트리의 한계"
    바퀴 미끄럼, 노면 불균일, 인코더 오차로 인해 오도메트리는 시간이 지날수록 누적 오차가 커진다.
    실용적인 시스템에서는 IMU, LiDAR SLAM, 외부 카메라 등과 함께 사용한다.

---

## 정리

| 구동 방식 | 홀로노믹 | 자유도 | 역기구학 핵심 |
|-----------|----------|--------|---------------|
| 차동 구동 | ✗ | 2 | \(v_{l,r} = v_{b,x} \mp \omega_{b,z} w/2\) |
| 자전거형 | ✗ | 2 | \(\phi = \arctan(l\omega_{b,z}/v_{b,x})\) |
| 이중 후륜 | ✗ | 2 | 반경 비율로 속도 분배 |
| 애커만 | ✗ | 2 | 좌우 조향각 분리 |
| 옴니휠 | ✓ | 3 | \(A\mathbf{v}_b\)로 계산 |
| 스워브 드라이브 | ✓ | 3 | \(J\mathbf{v}_b\)로 계산, \(\arctan_2\)로 조향각 |
