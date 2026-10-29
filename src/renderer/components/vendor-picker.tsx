import { Check } from 'lucide-react';
import { type RefObject, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldTitle } from '@/components/ui/field';
import { VendorLogo } from '@/components/vendor-logo';
import type { Endpoint } from '@/lib/endpoints';
import { endpointVendors, type Vendor, vendorLabels, vendors } from '@/lib/vendors';

/**
 * The model vendor of a provider: the logo its badge shows. Unset follows the endpoint, which is offered as the
 * first choice so the badge that results from it is never a surprise.
 */
export function VendorField({
  endpoint,
  vendor,
  onChange,
}: {
  endpoint: Endpoint | undefined;
  vendor: Vendor | undefined;
  onChange: (vendor: Vendor | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  // Opened by keyboard, the dialog starts on the choice in effect rather than the first one.
  const current = useRef<HTMLButtonElement>(null);
  const followed = endpoint ? endpointVendors[endpoint] : undefined;
  const effective = vendor ?? followed;

  return (
    <Field className="max-w-md">
      <FieldTitle>模型厂商</FieldTitle>
      <Button
        type="button"
        variant="outline"
        className="justify-start"
        aria-haspopup="dialog"
        aria-label={`模型厂商：${vendor ? vendorLabels[vendor] : '跟随端点'}`}
        onClick={() => setOpen(true)}
      >
        {effective && <VendorLogo vendor={effective} size={12} className="size-4" />}
        <span className="truncate">{vendor ? vendorLabels[vendor] : '跟随端点'}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
          initialFocus={() => current.current}
        >
          <DialogHeader>
            <DialogTitle>模型厂商</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-1">
            <VendorOption
              vendor={followed}
              label={'跟随端点'}
              selected={!vendor}
              buttonRef={current}
              onSelect={() => {
                onChange(undefined);
                setOpen(false);
              }}
            />
            {vendors.map((candidate) => (
              <VendorOption
                key={candidate}
                vendor={candidate}
                label={vendorLabels[candidate]}
                selected={vendor === candidate}
                buttonRef={vendor === candidate ? current : undefined}
                onSelect={() => {
                  onChange(candidate);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Field>
  );
}

function VendorOption({
  vendor,
  label,
  selected,
  buttonRef,
  onSelect,
}: {
  vendor?: Vendor;
  label: string;
  selected: boolean;
  /** Set for the choice in effect, which the dialog focuses when it opens. */
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onSelect: () => void;
}) {
  return (
    <Button
      ref={buttonRef}
      type="button"
      variant="ghost"
      className="min-w-0 justify-start font-normal"
      aria-pressed={selected}
      onClick={onSelect}
    >
      {vendor ? (
        <VendorLogo vendor={vendor} size={12} className="size-4" />
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <span className="truncate">{label}</span>
      {selected && <Check className="ml-auto text-foreground" aria-hidden />}
    </Button>
  );
}
