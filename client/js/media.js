// 카메라, 마이크, 화면 공유 획득 (#15, #62)
// - 폰 카메라와 마이크는 https(보안 출처)에서만 열린다. http면 navigator.mediaDevices가 없다.
// - 화면 공유(getDisplayMedia)는 PC 브라우저만 지원한다. iOS는 지원하지 않는다.

// 화질 프로파일 (docs/05-test-plan.md): A = 고화질, B = 저화질
export const PROFILES = {
  A: { label: '고화질 1080p 30fps', width: 1920, height: 1080, frameRate: 30, maxBitrate: 2_500_000 },
  B: { label: '저화질 480p 15fps', width: 854, height: 480, frameRate: 15, maxBitrate: 500_000 },
};

export function mediaSupport() {
  return {
    secure: window.isSecureContext,
    camera: !!navigator.mediaDevices?.getUserMedia,
    screen: !!navigator.mediaDevices?.getDisplayMedia,
  };
}

export async function getCamera({ facingMode = 'environment', profile = 'B' } = {}) {
  const p = PROFILES[profile] ?? PROFILES.B;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: p.width },
      height: { ideal: p.height },
      frameRate: { ideal: p.frameRate },
    },
    audio: false,
  });
  return stream.getVideoTracks()[0];
}

export async function getMic() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: false,
  });
  return stream.getAudioTracks()[0];
}

export async function getScreen() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 15, max: 30 } },
    audio: false,
  });
  const track = stream.getVideoTracks()[0];
  // 글자와 선이 많은 화면(도면, 매뉴얼)은 선명함을 우선한다
  if ('contentHint' in track) track.contentHint = 'detail';
  return track;
}

// 사용자가 이해할 수 있는 오류 문구
export function mediaErrorText(err) {
  switch (err?.name) {
    case 'NotAllowedError':
      return '권한이 거부되었습니다. 주소창의 권한 설정에서 허용하세요';
    case 'NotFoundError':
      return '장치를 찾지 못했습니다';
    case 'NotReadableError':
      return '다른 앱이 장치를 쓰고 있습니다';
    case 'OverconstrainedError':
      return '요청한 화질을 장치가 지원하지 않습니다';
    default:
      return err?.message ?? String(err);
  }
}
