import type { CSSProperties } from "react";

/** Shared N48a split-layout artwork for login, forgot and reset surfaces. */
export function AuthArt({ title, description }: { title: string; description: string }) {
  return (
    <section className="ef-auth-art" aria-hidden="true">
      <svg className="ef-auth-stars" viewBox="0 0 900 600" preserveAspectRatio="xMidYMid slice">
        <line x1="120" y1="460" x2="330" y2="470" />
        <line x1="86" y1="260" x2="148" y2="228" />
        <line x1="610" y1="352" x2="672" y2="246" />
        <line x1="672" y1="246" x2="756" y2="286" />
        <line x1="404" y1="208" x2="548" y2="118" />
        <line x1="601" y1="322" x2="712" y2="276" />
        <line x1="714" y1="276" x2="664" y2="364" />
        <line x1="442" y1="142" x2="654" y2="90" />
        <line x1="490" y1="204" x2="412" y2="62" />
        <circle cx="120" cy="460" r="5" style={{ "--c": "var(--domain-1)" } as CSSProperties} />
        <circle cx="330" cy="470" r="7" style={{ "--c": "var(--domain-2)" } as CSSProperties} />
        <circle cx="86" cy="260" r="5" style={{ "--c": "var(--domain-1)" } as CSSProperties} />
        <circle cx="148" cy="228" r="6" style={{ "--c": "var(--domain-3)" } as CSSProperties} />
        <circle cx="610" cy="352" r="6" style={{ "--c": "var(--domain-5)" } as CSSProperties} />
        <circle cx="672" cy="246" r="9" style={{ "--c": "var(--domain-4)" } as CSSProperties} />
        <circle cx="756" cy="286" r="5" style={{ "--c": "var(--domain-1)" } as CSSProperties} />
        <circle cx="404" cy="208" r="5" style={{ "--c": "var(--domain-5)" } as CSSProperties} />
        <circle cx="548" cy="118" r="8" style={{ "--c": "var(--domain-2)" } as CSSProperties} />
        <circle cx="601" cy="322" r="8" style={{ "--c": "var(--domain-6)" } as CSSProperties} />
        <circle cx="712" cy="276" r="6" style={{ "--c": "var(--domain-1)" } as CSSProperties} />
        <circle cx="664" cy="364" r="5" style={{ "--c": "var(--domain-2)" } as CSSProperties} />
        <circle cx="442" cy="142" r="7" style={{ "--c": "var(--domain-4)" } as CSSProperties} />
        <circle cx="654" cy="90" r="5" style={{ "--c": "var(--domain-1)" } as CSSProperties} />
        <circle cx="490" cy="204" r="6" style={{ "--c": "var(--domain-1)" } as CSSProperties} />
        <circle cx="412" cy="62" r="5" style={{ "--c": "var(--domain-3)" } as CSSProperties} />
      </svg>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}
