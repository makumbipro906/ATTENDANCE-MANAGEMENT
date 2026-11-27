import Link from "next/link";

const settings = [
  ["Academic years", "Manage school years and enrollment periods.", "/settings/years", "▣"],
  ["Terms", "Configure terms within each academic year.", "/settings/terms", "▤"],
  ["Classes", "Set up grades and class groups.", "/settings/classes", "♙"],
  ["Streams", "Organize class streams and sections.", "/settings/streams", "◫"],
  ["Sections", "Manage the school sections available.", "/settings/sections", "⌂"],
];

export default function SettingsPage() {
  return (
    <div className="page-content">
      <div className="page-heading"><div><div className="eyebrow">Administration</div><h1 className="page-title">School settings</h1><p className="page-description">Manage the academic structure used across your school.</p></div></div>
      <section aria-label="School configuration" className="settings-grid">
        {settings.map(([title, description, href, icon]) => (
          <Link className="card setting-link" href={href} key={href}>
            <span aria-hidden="true" className="setting-icon">{icon}</span>
            <span className="setting-copy"><strong>{title}</strong><p>{description}</p></span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
