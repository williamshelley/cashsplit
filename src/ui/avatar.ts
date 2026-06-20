import { el } from "./dom";
import { initials, personColor, YOU_COLOR } from "./viewmodel";
import type { Person } from "../types";

/** A circular initials avatar, colored for the person (blue for the current user). */
export function avatar(
  person: Person,
  currentUid: string | null,
  opts: { small?: boolean } = {},
): HTMLElement {
  return el(
    "span",
    {
      class: `avatar${opts.small ? " sm" : ""}`,
      style: `background:${personColor(person, currentUid)}`,
      title: person.name,
    },
    initials(person.name),
  );
}

/** A "you" avatar built from a label (e.g. an email) when there's no Person object. */
export function youAvatar(label: string): HTMLElement {
  return el(
    "span",
    { class: "avatar", style: `background:${YOU_COLOR}`, title: label },
    initials(label),
  );
}

/** Up to `max` overlapping avatars for a set of people. */
export function avatarStack(people: Person[], currentUid: string | null, max = 4): HTMLElement {
  return el(
    "span",
    { class: "avatar-stack" },
    people.slice(0, max).map((p) => avatar(p, currentUid, { small: true })),
  );
}
