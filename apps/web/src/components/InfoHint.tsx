import { Icon, IconButton, Tooltip } from "@index/ui";

/** Значок «і» в шапці сторінки: пояснення до екрана живе в підказці, а на екрані лишаються лише дані. */
export function InfoHint({ label, text }: { readonly label: string; readonly text: string }) {
  return (
    <Tooltip content={text} placement="bottom">
      <IconButton label={label} icon={<Icon name="info" />} showTooltip={false} />
    </Tooltip>
  );
}
