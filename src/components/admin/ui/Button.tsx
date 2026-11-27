import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const base = "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-busy:cursor-progress";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-emerald-700 text-white hover:bg-emerald-800 active:bg-emerald-900",
  secondary: "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 active:bg-zinc-100",
  ghost: "text-zinc-700 hover:bg-zinc-100 active:bg-zinc-200",
  danger: "text-rose-700 hover:bg-rose-50 active:bg-rose-100",
};
// Không có chữ (chỉ icon) thì nút vuông; nhớ truyền aria-label.
const sizes = (iconOnly: boolean): Record<ButtonSize, string> => ({
  md: iconOnly ? "h-9 w-9 text-sm" : "h-9 px-4 text-sm",
  sm: iconOnly ? "h-[30px] w-[30px] text-[13px]" : "h-[30px] px-3 text-[13px]",
});

type Look = { variant?: ButtonVariant; size?: ButtonSize; icon?: IconName };
const look = ({ variant = "secondary", size = "md" }: Look, iconOnly: boolean, className?: string) => [base, variants[variant], sizes(iconOnly)[size], className].filter(Boolean).join(" ");
const iconSize = (size: ButtonSize = "md") => size === "sm" ? 14 : 16;

/** `type` mặc định là "button"; nút gửi form phải ghi `type="submit"`. `loading` = vô hiệu + aria-busy (đổi chữ nút tại chỗ gọi, vd. "Đang lưu…"). */
export function Button({ variant, size, icon, loading, className, children, type = "button", disabled, ...rest }: Look & { loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={look({ variant, size }, !children && !!icon, className)} {...rest}>
    {icon && <Icon name={icon} size={iconSize(size)} />}{children}
  </button>;
}

export function ButtonLink({ variant, size, icon, className, children, ...rest }: Look & ComponentProps<typeof Link>) {
  return <Link className={look({ variant, size }, !children && !!icon, className)} {...rest}>
    {icon && <Icon name={icon} size={iconSize(size)} />}{children}
  </Link>;
}
