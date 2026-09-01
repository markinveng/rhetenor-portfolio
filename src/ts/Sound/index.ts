import { Howl } from "howler";

export interface SoundController {
  /** 再生/ミュートを切り替える。切り替え後のミュート状態を返す。 */
  toggle(): boolean;
  isMuted(): boolean;
  /** 音源を差し替える(仮実装)。mp3アップロード後、実際のURLを渡す想定。 */
  setSource(url: string): void;
}

/** 仮の音源URL。mp3は後でアップロードされる予定のためファイルは未配置。 */
const DEFAULT_SOUND_URL = "/sounds/bgm.mp3";

let howl: Howl | null = null;
let controller: SoundController | null = null;
let muted = true;

function createHowl(url: string): Howl {
  return new Howl({
    src: [url],
    loop: true,
    volume: 0.5,
    mute: muted,
  });
}

/**
 * サイト共通のBGM再生コントローラー(シングルトン)。
 * ページ遷移をまたいで再生状態を保持するため、main.tsのApp.init/destroyでは
 * 破棄せず、getOrCreateSound()を呼ぶだけにする。
 */
export function getOrCreateSound(): SoundController {
  if (controller) {
    return controller;
  }

  howl = createHowl(DEFAULT_SOUND_URL);

  controller = {
    toggle() {
      muted = !muted;
      howl?.mute(muted);

      if (!muted && !howl?.playing()) {
        howl?.play();
      }

      return muted;
    },

    isMuted() {
      return muted;
    },

    setSource(url) {
      const wasMuted = muted;

      howl?.unload();
      howl = createHowl(url);
      muted = wasMuted;
      howl.mute(muted);
    },
  };

  return controller;
}
