# 하늘마루 · Haneulmaru

PC에서 합성 3D 지형과 비행체를 렌더링하고 휴대폰으로 WebRTC 영상을 전송하는 데모입니다. 가상환경과 카메라 AR을 전환할 수 있습니다.

## 빠른 시작

1. 이 저장소를 내려받아 압축을 풀거나 Git으로 clone합니다.
2. Windows x64 환경에서 Python 3.10 이상을 설치합니다.
3. `하늘마루_실행.cmd`를 실행합니다. 처음 실행 시 프로젝트의 `.venv`와 `reportlab`, `pyserial`, `bleak`을 설치하고 공식 cloudflared 실행 파일을 내려받아 SHA-256을 검증합니다.
4. PC 렌더러 탭을 화면에 유지합니다.
5. PC와 휴대폰을 같은 Wi-Fi/핫스팟에 연결하고 PC 화면의 QR을 폰에서 엽니다.
6. 폰에서 **PC 연결 시작**을 누릅니다.

서버 종료는 명령창에서 Ctrl+C입니다. 재시작하면 URL/연결 키가 바뀝니다. 기기 간 통신이 차단된 Wi-Fi에서는 연결되지 않을 수 있습니다.

## 팀원용 자료

- [먼저 읽기](00_먼저읽기.txt)
- [NUCODE IMU 연결 합의](01_IMU_연결합의.txt)
- [NU40 USB/BLE 시점 조작 사용법](NU40_연동_사용법.txt)
- [구조와 검증 범위](02_구조와검증.txt)
- [IMU 참고 파일](IMU_참고)
- [PC 송신·휴대폰 수신 소스](experiments/haneulmaru_pro)
- [정지사진 drone / 색상표식 데이터셋 제작·테스트](experiments/photo_color_dataset/README.md)
- [데이터 라벨·manifest·검증 보고서](datasets/photo_color_v1_metadata)
- [RTX / AWS 사용법](experiments/haneulmaru_pro/AWS_RTX_사용법.txt)

**NU40 USB/BLE 입력으로 가상 카메라의 상하좌우 시점을 조작할 수 있습니다.** 팀원 저장소의 방향 학습 모델과 수신기를 통합했습니다. PC의 `NUCODE · IMU` 패널에 수신 상태가 뜨면 **IMU 시작**을 누르세요. USB 입력이 우선이며, 끊기면 최신 BLE 입력을 사용합니다. 양쪽 모두 오래되거나 끊기면 IMU 조작을 해제하고 마우스·휴대폰 조작으로 돌아갑니다. 연결 복구 뒤에는 **IMU 시작**을 다시 누릅니다.

이는 각속도를 이용한 상대 시점 회전입니다. 실제 공간의 위치·높이나 절대 방위를 측정하지 않습니다. 이번 통합은 자동 테스트로 검증했으며, 실제 장착 방향·감도·USB 분리 체감은 팀원 보드에서 확인해야 합니다. 참고 펌웨어는 보드에 자동 업로드되지 않습니다. Linux는 `bash 실행.sh`로 로컬 PC 화면을 실행합니다(기본값은 외부 HTTPS 터널 없음).

## 렌더링·통신

Three.js/WebGL → canvas.captureStream → WebRTC 비디오 → 휴대폰.
터치·회전·설정은 RTCDataChannel로 전달합니다. Python 서버는 정적 페이지, SDP/ICE, 인증된 로컬 IMU·AWS API를 처리합니다. Cloudflare HTTPS 터널은 페이지/시그널링 전달에 사용합니다. TURN 영상 중계는 없습니다.

폰 카메라는 폰에서만 사용합니다. 카메라 AR은 크로마키 합성으로, 정밀 공간 고정 AR은 아닙니다. 지형과 비행체는 합성 데이터이며 실제 탐지·타격 시스템이 아닙니다.

## 성능 및 한계

- 장면 품질과 영상 전송 화질은 별도 설정입니다. **장면 균형 + 전송 선명 1920**으로 시작하세요.
- 1920·2560픽셀 전송을 PC 두 탭 사이에서 확인했습니다. 실제 휴대폰의 최신 화질 개선 효과는 추가 측정이 필요합니다.
- `Microsoft Basic Render Driver`가 표시되면 RTX 렌더링이 아닙니다.
- 배경/최소화된 탭에서는 FPS가 제한될 수 있습니다.
- 별도 Chrome 프로필과 고성능 GPU 옵션을 사용합니다. 장치명에서 실제 GPU를 확인하세요. CUDA 설치 여부와 WebGL GPU 선택은 별개입니다.
- `http://127.0.0.1:8792/host`에서 AWS Bedrock 단기 키를 입력할 수 있습니다. 키는 서버 메모리에만 보관되며 재시작하면 다시 입력합니다. 기본 모델은 `us.anthropic.claude-sonnet-4-6`, 리전은 `us-east-1`입니다.
- AWS는 버튼을 누를 때 장면 설정 제안/성능 설명을 요청합니다. 사진이나 카메라 영상을 AWS에 전송하지 않습니다.
- 첫 영상 프레임 대기, PC 탭 숨김, 영상 프레임 중단 상태를 구분해서 표시합니다. PC 렌더러를 화면에 유지하세요.

## 정지사진 데이터셋

원본 사진 300장과 red/blue/green 표식 변형 900장, 총 1,200장의 실험용 데이터셋을 만들었습니다. 객체 클래스는 `drone` 하나입니다. train/val/test는 840/240/120장이고 같은 원본의 네 변형은 한 split에만 들어갑니다. 표식은 사진 위에 합성한 2D 태그이며 실물 표식 촬영이나 학습 모델이 아닙니다.

공개 저장소에는 제작기·라벨·manifest·검증 보고서를 포함합니다. 공개 원본 일부에 상용 사진 워터마크가 보여 사진 자체는 재배포하지 않았습니다. [원본 COCO ZIP](https://universe.roboflow.com/ai-bmkoo/drone-detection-inlmy/dataset/1/download/coco)을 내려받은 뒤 `데이터셋_재생성.cmd`에 ZIP 경로를 입력하면 재생성됩니다. 팀원이 별도로 받은 `photo_color_v1_팀원전달.zip`은 압축을 풀고 `미리보기.html`만 열면 됩니다.

## 포함 구성요소

Git 저장소에서는 Windows x64 cloudflared 2026.10.0을 첫 실행 때 공식 GitHub 배포본에서 다운로드합니다. 제3자 라이선스 및 버전은 `tools/cloudflared`와 `experiments/haneulmaru_pro/vendor`에 있습니다. 프로젝트 전체에 별도의 오픈소스 라이선스를 부여한 것은 아닙니다.

계정·실행 로그·현재 접속 키는 포함하지 않았습니다. `FILES_SHA256.json`은 전달 파일의 체크섬입니다.
