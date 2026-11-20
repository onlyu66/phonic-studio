export type VoicePreset = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export type TtsMode = 'single' | 'dual';

export type VoiceEngine = 'edge-free' | 'gemini';

export interface TtsScriptPayload {
  voice_preset: VoicePreset;
  speaking_style_prompt: string;
  clean_text_vi: string;
  estimated_duration_sec: number;
}

export interface BgmScriptPayload {
  lyria_prompt_en: string;
  bpm: number;
  mood: string;
  ducking_gain: number;
}

export interface SpeakerTurn {
  id: string;
  speaker: string;
  voicePreset: VoicePreset;
  style: string;
  text: string;
}

export interface DualSpeakerConfig {
  speakerA: {
    name: string;
    voicePreset: VoicePreset;
    style: string;
  };
  speakerB: {
    name: string;
    voicePreset: VoicePreset;
    style: string;
  };
  turns: Array<{
    id: string;
    speakerKey: 'A' | 'B';
    text: string;
  }>;
}

export interface TtsSingleRequest {
  mode: 'single';
  voicePreset: VoicePreset;
  speakingStylePrompt: string;
  text: string;
  estimatedDurationSec?: number;
}

export interface TtsDualRequest {
  mode: 'dual';
  speakerA: {
    name: string;
    voicePreset: VoicePreset;
    style: string;
  };
  speakerB: {
    name: string;
    voicePreset: VoicePreset;
    style: string;
  };
  turns: Array<{
    speakerKey: 'A' | 'B';
    text: string;
  }>;
}

export type TtsRequestBody = TtsSingleRequest | TtsDualRequest;

export interface TtsResponseBody {
  audioBase64: string;
  mimeType: 'audio/wav';
  durationSec: number;
  model: 'gemini-3.8-flash-tts';
  voiceLabel: string;
}

export interface EdgeTtsSegmentAudio {
  audioBase64: string;
  mimeType: 'audio/mpeg';
  pauseAfterMs: number;
  rate: string;
  edgeVoice: string;
  playbackMultiplier?: number;
}

export interface EdgeTtsResponseBody {
  segments: EdgeTtsSegmentAudio[];
  model: 'edge-neural-tts';
  provider?: 'edge-neural' | 'free-tts-fallback';
  voiceLabel: string;
  appliedRatesSummary: string;
}

export interface AudioTake {
  id: string;
  kind: 'voiceover' | 'bgm';
  createdAt: string;
  mode: TtsMode;
  voiceLabel: string;
  styleSummary: string;
  scriptPreview: string;
  durationSec: number;
  estimatedDurationSec: number;
  audioUrl: string;
  sizeBytes: number;
}

export interface VoiceCastOption {
  id: VoicePreset;
  name: string;
  register: string;
  character: string;
  bestFor: string;
}

export const VOICE_CAST: VoiceCastOption[] = [
  {
    id: 'Puck',
    name: 'Puck',
    register: 'Youthful Tenor',
    character: 'Energetic, agile, upbeat conversational cadence',
    bestFor: 'Tech tips, Reels/Shorts narration, dynamic explainers',
  },
  {
    id: 'Charon',
    name: 'Charon',
    register: 'Deep Baritone',
    character: 'Grounded, resonant, composed documentary authority',
    bestFor: 'Product launches, executive briefings, storytelling',
  },
  {
    id: 'Kore',
    name: 'Kore',
    register: 'Warm Alto',
    character: 'Clear, poised, articulate studio warmth',
    bestFor: 'Podcast co-host, tutorials, customer education',
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    register: 'Crisp Bass-Baritone',
    character: 'Direct, punchy, commanding broadcast presence',
    bestFor: 'Promo hooks, trailers, fast-paced commentary',
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    register: 'Bright Soprano',
    character: 'Light, friendly, expressive conversational flow',
    bestFor: 'Lifestyle narration, UI walkthroughs, social reels',
  },
];

export const VALID_VOICES: readonly VoicePreset[] = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

export const DEFAULT_SCRIPT_PAYLOAD: TtsScriptPayload = {
  voice_preset: 'Puck',
  speaking_style_prompt:
    'Giọng nam trẻ trung, năng động, pha chút hối hả ở đoạn đầu và tự tin, chuyên nghiệp ở phần hướng dẫn phím tắt.',
  clean_text_vi:
    'Lai la chieu thu Sau va sep gui mot bang Ec xen dai dang dac yeu cau loc du lieu gap de bao cao? Thay vi mo mat di chuot len thanh cong cu roi tim nut Sot va Phin to rat mat thoi gian va de nham lan. Ban chi can chon mot o bat ky trong bang du lieu, sau do nhan dong thoi to hop phim Con tron cong Sip cong chu Le. Ngay lap tuc, cac mui ten bo loc se hien ra o dau moi cot. De bo loc nhanh va quay lai trang thai ban dau, ban cung chi can nhan lai to hop phim Con tron cong Sip cong chu Le mot lan nua. Cuc ky nhanh gon va chuyen nghiep. Ban con biet phim tat nao giup cuu nguy ngay thu Sau khong? Binh luan chia se ben duoi de anh em cung ve som nhe.',
  estimated_duration_sec: 30,
};

export const DEFAULT_BGM_PAYLOAD: BgmScriptPayload = {
  lyria_prompt_en:
    'Upbeat lo-fi hip hop with a steady driving beat, light synthesizer melodies, corporate productivity vibe, energetic but not distracting, instrumental only.',
  bpm: 115,
  mood: 'Năng động, tích cực, hiệu quả',
  ducking_gain: 0.18,
};

export const DEFAULT_DUAL_CONFIG: DualSpeakerConfig = {
  speakerA: {
    name: 'Minh',
    voicePreset: 'Puck',
    style: 'Giọng nam trẻ trung, năng động, hơi gấp gáp khi kể tình huống chiều thứ Sáu.',
  },
  speakerB: {
    name: 'Linh',
    voicePreset: 'Kore',
    style: 'Giọng nữ tự tin, điềm tĩnh, hướng dẫn phím tắt rõ ràng và thân thiện.',
  },
  turns: [
    {
      id: 'turn-1',
      speakerKey: 'A',
      text: 'Chiều thứ Sáu rồi mà sếp vẫn gửi bảng Ec xen dài dằng dặc bắt lọc gấp để họp, nhìn hoa cả mắt!',
    },
    {
      id: 'turn-2',
      speakerKey: 'B',
      text: '|mhm| Bình tĩnh nào! Chọn một ô bất kỳ trong bảng, rồi nhấn Con tron cộng Sip cộng chữ L là xong ngay.',
    },
    {
      id: 'turn-3',
      speakerKey: 'A',
      text: '<gasp> Ủa nhanh vậy luôn hả? Để bấm thử liền còn kịp về sớm!',
    },
  ],
};

export interface VocalCue {
  token: string;
  label: string;
  description: string;
}

export const VOCAL_CUES: VocalCue[] = [
  { token: '<breath>', label: '<breath>', description: 'Natural intake breath pause' },
  { token: '<laugh>', label: '<laugh>', description: 'Light spontaneous laugh' },
  { token: '<gasp>', label: '<gasp>', description: 'Quick surprised gasp' },
  { token: '|yeah|', label: '|yeah|', description: 'Conversational agreement cue' },
  { token: '|mhm|', label: '|mhm|', description: 'Soft backchannel acknowledgement' },
];

export const STYLE_QUICK_PROMPTS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Energetic Creator (Default)',
    prompt:
      'Giọng nam trẻ trung, năng động, pha chút hối hả ở đoạn đầu và tự tin, chuyên nghiệp ở phần hướng dẫn phím tắt.',
  },
  {
    label: 'Warm Tutorial',
    prompt: 'Giọng đọc truyền cảm, ấm áp, phát âm rõ chữ, nhịp điệu vừa phải dễ theo dõi từng bước.',
  },
  {
    label: 'Broadcast Anchor',
    prompt: 'Giọng phát thanh viên chuyên nghiệp, dứt khoát, nhấn trọng tâm vào từ khóa quan trọng.',
  },
  {
    label: 'Casual Storyteller',
    prompt: 'Giọng kể chuyện tự nhiên như trò chuyện cùng đồng nghiệp, lên xuống ngữ điệu linh hoạt.',
  },
];
