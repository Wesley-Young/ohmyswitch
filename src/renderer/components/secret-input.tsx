import { cn } from 'cn';
import { Eye, EyeOff } from 'lucide-react';
import { type ComponentProps, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** A password input with an icon button that toggles whether the value is shown. */
export function SecretInput({
  className,
  label,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'> & { label: string }) {
  const [revealed, setRevealed] = useState(false);
  const action = revealed ? `隐藏 ${label}` : `显示 ${label}`;

  return (
    <div className="relative">
      <Input type={revealed ? 'text' : 'password'} className={cn('pr-9', className)} {...props} />
      <div className="absolute inset-y-0 right-1 flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label={action}
          aria-pressed={revealed}
          title={action}
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    </div>
  );
}
