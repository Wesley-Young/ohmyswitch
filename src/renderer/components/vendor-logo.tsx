// Deep imports keep the SVG components only: the package entry pulls in antd and @lobehub/ui.
import BaichuanColor from '@lobehub/icons/es/Baichuan/components/Color.js';
import BaiduColor from '@lobehub/icons/es/Baidu/components/Color.js';
import ClaudeColor from '@lobehub/icons/es/Claude/components/Color.js';
import CohereColor from '@lobehub/icons/es/Cohere/components/Color.js';
import DeepSeekColor from '@lobehub/icons/es/DeepSeek/components/Color.js';
import DoubaoColor from '@lobehub/icons/es/Doubao/components/Color.js';
import GeminiColor from '@lobehub/icons/es/Gemini/components/Color.js';
import GrokMono from '@lobehub/icons/es/Grok/components/Mono.js';
import GroqMono from '@lobehub/icons/es/Groq/components/Mono.js';
import HunyuanColor from '@lobehub/icons/es/Hunyuan/components/Color.js';
import KimiColor from '@lobehub/icons/es/Kimi/components/Color.js';
import { AVATAR_BACKGROUND as KIMI_BACKGROUND } from '@lobehub/icons/es/Kimi/style.js';
import MetaColor from '@lobehub/icons/es/Meta/components/Color.js';
import MiniMaxColor from '@lobehub/icons/es/Minimax/components/Color.js';
import MistralColor from '@lobehub/icons/es/Mistral/components/Color.js';
import OpenAIMono from '@lobehub/icons/es/OpenAI/components/Mono.js';
import OpenRouterColor from '@lobehub/icons/es/OpenRouter/components/Color.js';
import QwenColor from '@lobehub/icons/es/Qwen/components/Color.js';
import SiliconCloudColor from '@lobehub/icons/es/SiliconCloud/components/Color.js';
import StepFunMono from '@lobehub/icons/es/Stepfun/components/Mono.js';
import YiColor from '@lobehub/icons/es/Yi/components/Color.js';
import ZhipuColor from '@lobehub/icons/es/Zhipu/components/Color.js';
import { cn } from 'cn';
import type { ComponentType } from 'react';

import { type Vendor, vendorLabels } from '@/lib/vendors';

type Icon = ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;

/**
 * Vendors are shown in color. A mark that has no color version (the brand is monochrome, such as OpenAI's) is
 * drawn in the foreground color.
 */
const logos = {
  openai: OpenAIMono,
  anthropic: ClaudeColor,
  google: GeminiColor,
  deepseek: DeepSeekColor,
  qwen: QwenColor,
  moonshot: KimiColor,
  zhipu: ZhipuColor,
  xai: GrokMono,
  mistral: MistralColor,
  meta: MetaColor,
  groq: GroqMono,
  minimax: MiniMaxColor,
  doubao: DoubaoColor,
  hunyuan: HunyuanColor,
  baidu: BaiduColor,
  openrouter: OpenRouterColor,
  siliconcloud: SiliconCloudColor,
  stepfun: StepFunMono,
  cohere: CohereColor,
  yi: YiColor,
  baichuan: BaichuanColor,
} satisfies Record<Vendor, Icon>;

/**
 * Tiles in the brand's own color, for a color mark that is drawn in white and needs it to show. The mark is shrunk to
 * stay inside the filled circle, in the proportion of the brand's avatar.
 */
const backgrounds: Partial<Record<Vendor, string>> = {
  moonshot: KIMI_BACKGROUND,
};

/** The logo of a model vendor, as a small tile. */
export function VendorLogo({
  vendor,
  size = 11,
  className,
}: {
  vendor: Vendor;
  /** Logo size in pixels; the tile is sized with `className`. */
  size?: number;
  className?: string;
}) {
  const Icon = logos[vendor];
  const background = backgrounds[vendor];
  return (
    <span
      role="img"
      aria-label={vendorLabels[vendor]}
      title={vendorLabels[vendor]}
      className={cn('flex size-4 items-center justify-center rounded-full bg-background text-foreground', className)}
      style={background ? { backgroundColor: background } : undefined}
    >
      {/* Sized by class so it scales with the tile, and so a button's rule for bare icons doesn't enlarge it. */}
      {background ? <Icon className="size-3/5" aria-hidden /> : <Icon size={size} aria-hidden />}
    </span>
  );
}
