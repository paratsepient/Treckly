"use client";

import { useId, type ElementType, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { FocusPulse, ScrollArea, Tooltip } from "@index/ui";
import { useAppShell } from "./AppShell.tsx";

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ReactNode;
  /** Короткий лічильник (кількість нових записів). */
  readonly badge?: string;
}

export interface NavGroup {
  readonly id: string;
  readonly label?: string;
  readonly items: readonly NavItem[];
}

export interface AppSidebarProps {
  /**
   * Пункти, які вже відфільтровано зовнішньою конфігурацією доступів.
   * Sidebar не обчислює права: він показує рівно те, що отримав.
   */
  readonly groups: readonly NavGroup[];
  readonly activeItemId?: string;
  readonly brand: { readonly name: string; readonly mark?: ReactNode };
  /** Контекст ролі: від імені кого та в якому підрозділі працює користувач. */
  readonly roleContext?: { readonly label: string; readonly value: string };
  readonly user?: { readonly name: string; readonly role?: string; readonly initials: string };
  readonly onNavigate?: (item: NavItem, event: MouseEvent<HTMLElement>) => void;
  /** Компонент посилання роутера (наприклад, Link). За замовчуванням — <a>. */
  readonly linkComponent?: ElementType;
}

/**
 * Стрілки вгору/вниз переходять між пунктами навігації, Home/End — до крайніх.
 * Tab і далі проходить усі посилання: навігація — список посилань, а не меню,
 * тому roving tabindex тут не потрібен.
 */
function handleArrowNavigation(event: KeyboardEvent<HTMLElement>): void {
  const links = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-nav-link]"));
  const index = links.findIndex((link) => link === document.activeElement);
  if (index === -1) return;
  const target = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: links.length - 1 }[event.key];
  if (target === undefined) return;
  event.preventDefault();
  links[(target + links.length) % links.length]?.focus();
}

/**
 * Глобальна навігація. Поруч із контентом — вузька колонка лише з іконками: назви дають
 * aria-label і Tooltip, назви груп і профіль лишаються для зчитувача. Активний пункт
 * зливається із сусідньою панеллю, як вкладка-папка (shell.css). У Drawer на вузьких
 * екранах — повний список з підписами: там колонка забрала б помітну частину ширини.
 */
export function AppSidebar({ groups, activeItemId, brand, roleContext, user, onNavigate, linkComponent }: AppSidebarProps) {
  const shell = useAppShell();
  const baseId = useId();
  const rail = shell.sidebarPresentation === "docked";
  const Link = linkComponent ?? "a";

  const renderLink = (item: NavItem) => {
    const active = item.id === activeItemId;
    const link = (
      <Link
        href={item.href}
        className="ixp-sidebar__link ix-focus-pulse"
        data-nav-link=""
        aria-current={active ? "page" : undefined}
        // У колонці підпису не видно, тому назва (і лічильник) передається явно.
        aria-label={rail ? (item.badge ? `${item.label} (${item.badge})` : item.label) : undefined}
        onClick={(event: MouseEvent<HTMLElement>) => {
          onNavigate?.(item, event);
          shell.setNavigationOpen(false);
        }}
      >
        <span className="ixp-sidebar__icon" aria-hidden="true">
          {item.icon}
          {/* У колонці лічильник прив'язаний до кута іконки ззовні, щоб не накривати її. */}
          {rail && item.badge ? <span className="ixp-sidebar__badge">{item.badge}</span> : null}
        </span>
        {rail ? null : <span className="ixp-sidebar__label">{item.label}</span>}
        {item.badge && !rail ? <span className="ixp-sidebar__badge">{item.badge}</span> : null}
        <FocusPulse />
      </Link>
    );
    return (
      <li key={item.id}>
        {rail ? (
          <Tooltip content={item.label} duplicatesLabel placement="right">
            {link}
          </Tooltip>
        ) : (
          link
        )}
      </li>
    );
  };

  return (
    <div className="ixp-sidebar" data-rail={rail ? "" : undefined}>
      <div className="ixp-sidebar__brand">
        <span className="ixp-sidebar__mark" aria-hidden="true">
          {brand.mark}
        </span>
        <span className={rail ? "ix-sr-only" : "ixp-sidebar__name"}>{brand.name}</span>
      </div>
      {roleContext ? (
        // ix-sr-only — публічна утиліта стилів @index/ui; у колонці контекст ролі лишається доступним.
        <div className={rail ? "ix-sr-only" : "ixp-sidebar__role"}>
          <span className="ixp-sidebar__role-label">{roleContext.label}</span>
          <span className="ixp-sidebar__role-value">{roleContext.value}</span>
        </div>
      ) : null}
      <nav className="ixp-sidebar__nav" aria-label="Головна навігація" onKeyDown={handleArrowNavigation}>
        <ScrollArea label="Пункти навігації" className="ixp-sidebar__scroll" viewportClassName="ixp-sidebar__viewport" scrollbar={rail ? "hidden" : "auto"}>
          {groups.map((group) => {
            const headingId = `${baseId}-${group.id}`;
            return (
              <div key={group.id} className="ixp-sidebar__group" role="group" aria-labelledby={group.label ? headingId : undefined}>
                {group.label ? (
                  <h2 id={headingId} className={rail ? "ix-sr-only" : "ixp-sidebar__group-label"}>
                    {group.label}
                  </h2>
                ) : null}
                <ul className="ixp-sidebar__list">{group.items.map(renderLink)}</ul>
              </div>
            );
          })}
        </ScrollArea>
      </nav>
      {user ? (
        <div className="ixp-sidebar__footer">
          <div className="ixp-sidebar__user">
            <span className="ixp-sidebar__avatar" aria-hidden="true">
              {user.initials}
            </span>
            <span className={rail ? "ix-sr-only" : "ixp-sidebar__user-text"}>
              <span className="ixp-sidebar__user-name">{user.name}</span>
              {user.role ? <span className="ixp-sidebar__user-role">{user.role}</span> : null}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
