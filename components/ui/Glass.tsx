import type { HTMLAttributes } from "react";

export function Glass({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass rounded-2xl ${className}`} {...props} />;
}

export function Label({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`label ${className}`} {...props} />;
}
