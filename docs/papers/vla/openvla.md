# OpenVLA: An Open-Source Vision-Language-Action Model

!!! info "논문 정보"
    - **저자**: Moo Jin Kim, Karl Pertsch, Siddharth Karamcheti et al. (Stanford, UC Berkeley, Toyota Research Institute, Google DeepMind)
    - **출판**: arXiv 2024 (arXiv:2406.09246)
    - **키워드**: VLA, Vision-Language-Action, Robot Manipulation, Fine-Tuning, LoRA

---

## 한 줄 요약

> 970k 로봇 데이터로 학습한 7B 오픈소스 VLA. 55B짜리 RT-2-X를 16.5% 앞서며, LoRA로 소비자급 GPU에서도 fine-tuning 가능.

---

## 배경: 왜 VLA인가?

기존 로봇 정책의 핵심 문제는 **일반화 부족**이다.  
특정 물체, 특정 조명, 특정 명령에만 동작하고 조금만 달라지면 실패한다.

반면 CLIP, SigLIP, Llama 같은 비전-언어 모델은 인터넷 규모의 데이터로 학습해  
새로운 물체, 새로운 개념, 새로운 지시어에 강한 일반화 능력을 보인다.

**VLA(Vision-Language-Action Model)** 는 이 VLM을 로봇 제어에 직접 연결한다.  
VLM을 fine-tune해서 텍스트 토큰 대신 **로봇 행동**을 예측하게 만드는 것.

---

## 모델 구조

```
입력 이미지 → [DINOv2 + SigLIP] → MLP Projector → Llama 2 7B → 행동 토큰 디코딩 → 7D 행동
언어 지시 ──────────────────────────────────────────────────────↗
```

세 가지 핵심 구성요소:

1. **Visual Encoder**: DINOv2 + SigLIP 특징을 채널 방향으로 concatenate
    - DINOv2: 공간적 세부 정보 (정밀한 위치 파악)
    - SigLIP: 의미적 정보 (어떤 물체인지 이해)
    - 둘을 합치면 "어디 있는 무엇"을 더 잘 파악

2. **MLP Projector**: 시각 특징을 LLM 입력 공간으로 변환

3. **LLM Backbone**: Llama 2 7B

베이스 모델은 **Prismatic-7B VLM** (LLaVA 1.5 데이터로 사전학습된 VLM).

---

## 행동을 어떻게 토큰으로 만드나?

로봇 행동은 연속값(continuous)이다. LLM은 이산 토큰을 다룬다.  
OpenVLA는 각 행동 차원을 **256개 bin으로 이산화**한다.

- Bin 경계: 학습 데이터의 1~99 percentile 구간을 균등 분할 (min-max 아님)
    - 이상치가 bin 간격을 망가뜨리는 걸 방지
- Llama tokenizer의 **가장 적게 쓰이는 256개 토큰을 행동 토큰으로 덮어씀**
- 학습 목표: 행동 토큰에 대한 cross-entropy loss (next-token prediction)

7DoF 로봇팔 기준: $\Delta x, \Delta y, \Delta z, \Delta \text{roll}, \Delta \text{pitch}, \Delta \text{yaw}, \text{gripper}$ → 7개 토큰

---

## 학습 데이터

**Open X-Embodiment (OpenX)** 데이터셋에서 970k 에피소드 큐레이션.

- 70개 이상의 로봇 데이터셋, 다양한 embodiment·task·scene
- 필터링 기준:
    - 3인칭 카메라 + single-arm end-effector control만 사용
    - Octo의 mixture weight 적용 (다양성 낮은 데이터 down-weight)
- DROID 데이터셋: 초기 포함했지만 action token accuracy가 낮아 후반 학습에서 제외

---

## 주요 설계 결정들

| 결정 | 선택 | 이유 |
|------|------|------|
| VLM backbone | Prismatic (DINOv2+SigLIP) | LLaVA 대비 언어 grounding +10% |
| 이미지 해상도 | 224×224 | 384×384과 성능 동일, 학습 3배 빠름 |
| Vision encoder 학습 | 전체 학습 (unfreeze) | 로봇 제어에 필요한 세밀한 공간 정보 확보 |
| 학습 epoch | 27 epochs | action token accuracy 95% 도달까지 |
| Learning rate | 2e-5 (고정) | warmup 없음, VLM 사전학습과 동일 |

!!! note "VLM과 VLA 학습의 차이"
    VLM은 보통 1~2 epoch만 학습한다.  
    VLA는 27 epoch을 돌려야 action token accuracy가 95%에 도달했다.  
    로봇 데이터의 분포가 더 좁고 반복적이기 때문으로 보인다.

---

## 실험 결과

### Out-of-the-box 성능 (사전학습 그대로 평가)

WidowX (BridgeData V2) + Google Robot 29개 태스크:

| 모델 | 파라미터 | 평균 성공률 |
|------|---------|------------|
| RT-1-X | 35M | 낮음 |
| Octo | 93M | 낮음 |
| RT-2-X | **55B** | 기준 |
| **OpenVLA** | **7B** | RT-2-X 대비 **+16.5%** |

OpenVLA가 RT-2-X보다 7배 작으면서 성능은 높다.  
단, 의미적 일반화(semantic generalization)는 RT-2-X가 우세. RT-2-X는 로봇 데이터와 인터넷 데이터를 함께 학습해 인터넷 지식을 더 잘 보존한다.

### Fine-tuning 성능 (Franka robot)

10~150개 데모로 새 태스크에 fine-tuning:

- **단일 지시 좁은 태스크**: Diffusion Policy가 더 부드럽고 정밀
- **다중 지시 다양한 태스크**: OpenVLA가 우세 (언어 grounding 덕분)
- **전체 평균**: OpenVLA가 유일하게 모든 태스크에서 50% 이상 달성

OpenVLA (scratch, 로봇 사전학습 없이)와 비교하면 사전학습의 효과가 명확하다.

### Parameter-Efficient Fine-Tuning

| 전략 | 성공률 | 학습 파라미터 | VRAM |
|------|--------|-------------|------|
| Full FT | 69.7% | 7,188M | 163GB |
| Last layer only | 30.3% | 465M | 51GB |
| Sandwich | 62.1% | 914M | 64GB |
| **LoRA (r=32)** | **68.2%** | **97.6M** | **59.7GB** |

**LoRA가 최적의 균형점**: 전체 fine-tuning과 동등한 성능을, 1.4%의 파라미터만으로 달성.  
단일 A100 GPU에서 10~15시간이면 fine-tuning 완료.

### 양자화 추론

| 정밀도 | 성공률 | VRAM |
|--------|--------|------|
| bfloat16 | 71.3% | 16.8GB |
| int8 | 58.1% | 10.2GB |
| **int4** | **71.9%** | **7.0GB** |

**4-bit 양자화**: 성능 유지 + VRAM 절반 이하.  
int8이 오히려 나쁜 이유는 추론 속도가 너무 느려져(1.2Hz) 제어 주기가 맞지 않기 때문.

---

## 한계

- **단일 이미지 입력만 지원**: 실제 로봇은 다양한 센서 구성을 가짐
- **추론 속도 낮음**: RTX 4090에서 6Hz. ALOHA(50Hz 필요) 같은 고속 제어에 부적합
- **성공률 <90%**: 아직 실용적 신뢰성엔 부족
- **정밀한 dexterity 부족**: 좁은 태스크에서 Diffusion Policy보다 덜 부드러움

---

## 읽고 나서

**인상적인 점**

VLM을 그대로 갖다 쓰면서 행동을 토큰으로 변환하는 방식의 단순함이 놀랍다.  
복잡한 구조 없이 "행동도 그냥 텍스트처럼 예측하면 되지 않나?" 라는 발상이 실제로 작동한다는 게 흥미롭다.  

DINOv2와 SigLIP을 합친 이유도 명확하다. 공간 정보와 의미 정보를 분리해서 각자 잘하는 모델에게 맡긴 것.

**의문점**

- 행동을 256 bin으로 이산화하면 연속적인 궤적에서 정보 손실이 생기지 않을까?  
  Diffusion Policy가 정밀한 dexterous task에서 여전히 앞서는 게 이 때문일 수 있다.
- Co-training (로봇 데이터 + 인터넷 VL 데이터 동시 학습)을 하면 의미적 일반화도 잡을 수 있을까?  
  논문에서 RT-2-X가 이걸 했고 semantic generalization에서 우세했던 게 힌트가 된다.
- Action chunking을 추가하면 얼마나 달라질까? 논문 자체에서도 future work로 언급한다.
