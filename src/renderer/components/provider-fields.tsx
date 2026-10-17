import { SecretInput } from '@/components/secret-input';
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { type Endpoint, endpointLabels, endpoints } from '@/lib/endpoints';

export interface ProviderValues {
  name: string;
  baseUrl: string;
  apiKey: string;
  /** Unset until the user picks one; there is no default endpoint. */
  endpoint: Endpoint | undefined;
  /** An image or web page to take the icon from; empty uses the Base URL's site. */
  iconUrl: string;
}

export const emptyProviderValues: ProviderValues = {
  name: '',
  baseUrl: '',
  apiKey: '',
  endpoint: undefined,
  iconUrl: '',
};

/** The site whose icon is used when no icon address is given, shown as the field's placeholder. */
function siteOf(baseUrl: string) {
  try {
    const url = new URL(baseUrl.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The connection fields of a provider: name, Base URL, API Key, endpoint and icon. Only the text inputs are
 * width-limited.
 */
export function ProviderFields({
  values,
  onChange,
  fieldError,
}: {
  values: ProviderValues;
  onChange: (values: ProviderValues) => void;
  fieldError: (field: string) => string | undefined;
}) {
  const set = <K extends keyof ProviderValues>(key: K, value: ProviderValues[K]) =>
    onChange({ ...values, [key]: value });

  return (
    <FieldGroup className="gap-4">
      <Field className="max-w-md" data-invalid={Boolean(fieldError('name'))}>
        <FieldLabel htmlFor="provider-name">名称</FieldLabel>
        <Input
          id="provider-name"
          value={values.name}
          maxLength={128}
          autoFocus
          aria-invalid={Boolean(fieldError('name'))}
          onChange={(event) => set('name', event.target.value)}
        />
        <FieldError>{fieldError('name')}</FieldError>
      </Field>
      <Field className="max-w-md" data-invalid={Boolean(fieldError('baseUrl'))}>
        <FieldLabel htmlFor="provider-base-url">Base URL</FieldLabel>
        <Input
          id="provider-base-url"
          className="font-mono"
          placeholder="https://api.example.com"
          value={values.baseUrl}
          aria-invalid={Boolean(fieldError('baseUrl'))}
          onChange={(event) => set('baseUrl', event.target.value)}
        />
        <FieldError>{fieldError('baseUrl')}</FieldError>
      </Field>
      <Field className="max-w-md" data-invalid={Boolean(fieldError('apiKey'))}>
        <FieldLabel htmlFor="provider-api-key">API Key</FieldLabel>
        <SecretInput
          id="provider-api-key"
          label="API Key"
          className="font-mono"
          autoComplete="off"
          value={values.apiKey}
          aria-invalid={Boolean(fieldError('apiKey'))}
          onChange={(event) => set('apiKey', event.target.value)}
        />
        <FieldError>{fieldError('apiKey')}</FieldError>
      </Field>
      <FieldSet data-invalid={Boolean(fieldError('endpoint'))}>
        <FieldLegend variant="label">端点</FieldLegend>
        <RadioGroup
          className="gap-2.5"
          value={values.endpoint ?? null}
          aria-invalid={Boolean(fieldError('endpoint'))}
          onValueChange={(value) => set('endpoint', value as Endpoint)}
        >
          {endpoints.map((endpoint) => (
            <Field key={endpoint} orientation="horizontal">
              <RadioGroupItem id={`endpoint-${endpoint}`} value={endpoint} />
              <FieldLabel htmlFor={`endpoint-${endpoint}`} className="font-normal">
                {endpointLabels[endpoint]}
                <span className="font-mono text-xs text-muted-foreground">{endpoint}</span>
              </FieldLabel>
            </Field>
          ))}
        </RadioGroup>
        <FieldError>{fieldError('endpoint')}</FieldError>
      </FieldSet>
      <Field className="max-w-md" data-invalid={Boolean(fieldError('iconUrl'))}>
        <FieldLabel htmlFor="provider-icon-url">图标</FieldLabel>
        <Input
          id="provider-icon-url"
          className="font-mono"
          placeholder={siteOf(values.baseUrl) ?? 'https://example.com'}
          value={values.iconUrl}
          maxLength={2048}
          aria-invalid={Boolean(fieldError('iconUrl'))}
          onChange={(event) => set('iconUrl', event.target.value)}
        />
        <FieldError>{fieldError('iconUrl')}</FieldError>
      </Field>
    </FieldGroup>
  );
}
