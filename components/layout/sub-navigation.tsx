import Link from "next/link";

export type SubNavigationItem<T extends string> = {
  key: T;
  label: string;
  href: string;
};

export function SubNavigation<T extends string>({
  label,
  items,
  activeItem,
}: {
  label: string;
  items: Array<SubNavigationItem<T>>;
  activeItem: T;
}) {
  return (
    <nav className="relay-subnav" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={activeItem === item.key ? "page" : undefined}
          className={activeItem === item.key ? "relay-subnav-active" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
