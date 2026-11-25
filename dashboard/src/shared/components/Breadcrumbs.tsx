import { ChevronRightIcon } from "../../components/icons";

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  active?: boolean;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (!items || items.length === 0) return null;

  return (
    <nav className="academic-breadcrumbs" aria-label="Breadcrumb">
      <ol className="breadcrumbs-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1 || item.active;
          return (
            <li key={index} className={`breadcrumb-item ${isLast ? "current" : ""}`}>
              {item.onClick && !isLast ? (
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
              ) : (
                <span className="breadcrumb-text">{item.label}</span>
              )}
              {!isLast && (
                <span className="breadcrumb-separator" aria-hidden="true">
                  <ChevronRightIcon width={14} height={14} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
