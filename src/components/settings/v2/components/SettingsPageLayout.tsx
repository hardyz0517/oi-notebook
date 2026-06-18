import type { ReactNode } from "react";

const SETTINGS_PAGE_TITLE_BY_SECTION_TITLE: Record<string, string> = {
  "\u0041\u0049 \u4f9b\u5e94\u5546": "AI",
  "\u672c\u5730\u7b14\u8bb0\u7d22\u5f15": "AI",
  "\u9ad8\u7ea7": "\u9ad8\u7ea7 / \u5f00\u53d1\u8005",
};

export function SettingsPageLayout({
  title,
  description,
  embedded = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  embedded?: boolean;
  children: ReactNode;
}) {
  const pageTitle = SETTINGS_PAGE_TITLE_BY_SECTION_TITLE[title] ?? title;

  if (embedded) {
    return <>{children}</>;
  }

  return (
    <section className="settings-v2-page">
      <header className="settings-v2-page-header">
        <h2>{pageTitle}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="settings-v2-page-body">{children}</div>
    </section>
  );
}
