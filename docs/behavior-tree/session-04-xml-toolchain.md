# XML과 툴체인

    - **핵심 목표**: XML로 트리 구조를 정의하는 문법, C++ Factory에 노드를 등록하는 절차, Groot2로 시각화·모니터링하는 방법
    - **참고 자료**: [behaviortree.dev - Tutorials](https://www.behaviortree.dev/docs/tutorial-basics/tutorial_01_first_tree/), Groot2 공식 문서
    - **수학/수식**: 이번 세션에는 없음

---

## 한 줄 요약

> 트리의 "설계도"는 XML 파일로 적고, 그 설계도 안의 이름표들이 실제로 어떤 C++ 코드와 연결되는지는 Factory에 등록하는 과정으로 이어주며, Groot2는 이 설계도를 그림으로 보여주고 실행 중인 모습까지 실시간으로 보여준다.

---

## 원인과 결과: 왜 트리를 코드가 아니라 XML로 적는가

세션 1~3까지는 트리를 개념적으로(그림으로) 다뤘다. 그런데 실제로 로봇에 이 트리를 넣으려면 어떤 형태로든
"코드"가 되어야 한다. 가장 단순한 방법은 C++로 트리 구조를 직접 하드코딩하는 것이다.

**원인**: 트리 구조를 C++ 코드로 직접 짜면, 트리의 순서를 하나 바꾸기 위해서도 코드를 고치고 다시 컴파일해야 한다.
로봇 개발 현장에서는 "AI 설계자(기획자)가 트리의 우선순위를 조정하고, 프로그래머는 그 아래 실제 동작(Action)만
구현"하는 식으로 역할이 나뉘는 경우가 많다. 코드로만 표현하면 이 역할 분리가 불가능하다.

**결과**: BT 커뮤니티는 트리의 **구조(뼈대)**는 XML(순수 텍스트) 파일로 분리하고, 그 뼈대가 실행될 때 실제로
무엇을 하는지(Action의 내용물)만 C++ 코드로 구현하는 방식을 표준으로 삼았다. XML은 프로그래밍을 몰라도
수정할 수 있고, 컴파일 없이 파일만 바꿔서 즉시 트리 구조를 바꿀 수 있다.

---

## XML 트리 예시

```xml
<?xml version="1.0"?>
<root BTCPP_format="4">
  <BehaviorTree ID="MainTree">
    <Fallback name="사람대응우선">
      <Sequence name="사람발견시정지">
        <Condition ID="IsPersonDetected" />
        <Action    ID="StopRobot" />
      </Sequence>
      <Action ID="MoveForward" speed="0.3" />
    </Fallback>
  </BehaviorTree>
</root>
```

XML의 들여쓰기 구조가 그대로 트리의 부모-자식 관계다. `<Fallback>` 태그 안에 `<Sequence>`와 `<Action>`이
자식으로 들어있는 것이, 세션 2에서 배운 "Fallback의 자식은 Sequence와 Action 둘"이라는 그림과 정확히 대응된다.

```
XML 들여쓰기                    ↔        트리 그림

<Fallback>                             Fallback
  <Sequence>                          ┌────┴────┐
    <Condition/>                   Sequence   MoveForward
    <Action/>                      ┌───┴───┐
  </Sequence>                  Condition  Action
  <Action/>
</Fallback>
```

---

## Factory 등록 — XML의 이름표를 실제 C++ 코드와 연결하기

XML에는 `IsPersonDetected`, `StopRobot` 같은 **이름표(문자열)**만 적혀 있다. 이 이름표가 실제로 어떤 C++ 클래스를
가리키는지는 프로그램이 시작할 때 **BehaviorTreeFactory**라는 객체에 등록해줘야 한다.

```cpp
BT::BehaviorTreeFactory factory;

// "이 이름표는 이 C++ 클래스를 가리킨다"고 알려주는 과정
factory.registerNodeType<IsPersonDetected>("IsPersonDetected");
factory.registerNodeType<StopRobot>("StopRobot");
factory.registerNodeType<MoveForward>("MoveForward");

// 등록이 끝난 뒤 XML 파일을 읽어서 실제 트리 객체를 만든다
auto tree = factory.createTreeFromFile("main_tree.xml");

// 이후 주기적으로 tickOnce() 를 불러주면 트리가 동작한다
while (true) {
    tree.tickOnce();
}
```

이 구조 덕분에, XML 파일 하나만 있으면 등록된 노드들을 자유롭게 재조합해서 완전히 다른 트리를 여러 개 만들 수 있다.
"레고 블록(C++ Action 구현들)을 미리 준비해두고, 설계도(XML)만 바꿔서 다른 로봇을 조립하는 것"과 같다.

---

## Groot2 — 트리를 그림으로 보고, 실행을 실시간으로 지켜보기

XML 텍스트만으로는 트리가 복잡해질수록 구조를 파악하기 어렵다. **Groot2**는 BehaviorTree.CPP 공식 GUI 툴로,
두 가지 핵심 기능을 제공한다.

1. **Editor 모드**: XML을 마우스로 드래그해서 노드를 배치하며 트리를 만들고, 자동으로 XML 파일로 저장한다.
2. **Monitor 모드**: 실행 중인 로봇에 실시간으로 연결해서, **지금 이 순간 어떤 노드가 SUCCESS(초록)/FAILURE(빨강)/RUNNING(노랑)인지**
   색깔로 트리 위에 표시해준다.

```
Groot2 Monitor 화면 예시 (색상으로 상태 표현)

  Fallback  ── 노랑(RUNNING)
   ├── Sequence ── 노랑(RUNNING)
   │    ├── IsPersonDetected ── 빨강(FAILURE, 사람 없음)
   │    └── StopRobot        ── (틱 안됨, 회색)
   └── MoveForward           ── 노랑(RUNNING, 지금 이동 중)
```

이 화면 하나만 보면 "지금 로봇이 왜 이렇게 움직이고 있는지"를 코드를 뒤지지 않고도 바로 알 수 있다.
이것이 BT가 "디버깅하기 쉬운 AI 구조"라고 불리는 결정적인 이유다.

---

## 핵심 개념 정리

!!! tip "이 세션의 핵심 3가지"
    1. **XML = 트리의 뼈대(설계도), C++ = 실제 동작 구현** — 이 둘을 분리하면 코드 재컴파일 없이 트리 구조를 바꿀 수 있다.
    2. **Factory 등록 = XML의 문자열 이름표와 C++ 클래스를 연결하는 절차** — 등록해야만 XML을 읽어 실제 트리를 만들 수 있다.
    3. **Groot2 Monitor = 실행 중인 트리를 색깔로 실시간 시각화** — SUCCESS/FAILURE/RUNNING을 눈으로 바로 확인해 디버깅 시간을 크게 줄인다.

---

## 복습 (15분)

### 매칭 문제

아래 XML 구조를 보고 트리 그림을 손으로 그려보세요.

```xml
<Sequence>
  <Condition ID="BatteryOK" />
  <Fallback>
    <Action ID="TryChargeStation1" />
    <Action ID="TryChargeStation2" />
  </Fallback>
</Sequence>
```

??? success "정답"
    ```
              Sequence
             ┌────┴────┐
        BatteryOK   Fallback
                    ┌───┴───┐
             ChargeStation1  ChargeStation2
    ```

### 퀴즈

!!! question "Q1"
    XML에 `IsPersonDetected`라는 이름표만 적어놓고 Factory에 등록하지 않으면 어떻게 되는가?

??? success "정답"
    `createTreeFromFile()`이 실패한다. XML의 이름표는 문자열일 뿐이라, Factory에 등록되어 실제 C++ 클래스와 연결되어 있어야만 트리 객체로 생성될 수 있다.

!!! question "Q2"
    같은 C++ Action 클래스를 재컴파일 없이 다른 순서로 배치하고 싶다면 무엇을 바꿔야 하는가?

??? success "정답"
    XML 파일만 수정하면 된다. C++ 코드(Factory 등록, Action 클래스 구현)는 그대로 둔 채 XML의 트리 구조만 재배치할 수 있다.

!!! question "Q3"
    Groot2의 Monitor 모드가 개발자에게 실질적으로 주는 이점은 무엇인가?

??? success "정답"
    로그나 print문을 뒤지지 않고도, 지금 어떤 노드가 성공/실패/실행 중인지 색깔로 즉시 확인할 수 있어 디버깅 속도가 크게 빨라진다.

---

## 다음 세션 예고

**세션 5: Decorator 노드 심화**

- Inverter, Retry, Timeout, ForceSuccess/Failure, RunOnce, Repeat
- 재시도 횟수와 타임아웃 시간을 어떻게 설계해야 하는가

[다음 세션 → 세션 5 · Decorator 노드 심화](session-05-decorators.md){ .md-button .md-button--primary }
