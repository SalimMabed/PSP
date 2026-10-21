import type { Page } from "@/domain/filters";
import { Icon } from "./Icon";

export function Pagination<T>({ page, onPage, label = "results" }: { page: Page<T>; onPage: (n: number) => void; label?: string }) {
  if (page.total === 0) return null;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-ivory-line px-4 py-3 text-[13px] text-ink-muted">
      <p aria-live="polite">
        <span className="num font-semibold text-ink">
          {page.from}–{page.to}
        </span>{" "}
        of <span className="num font-semibold text-ink">{page.total}</span> {label}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onPage(page.page - 1)}
          disabled={page.page <= 1}
          aria-label="Previous page"
        >
          <Icon name="chevron-left" size={15} />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <span className="num px-2" aria-current="page">
          Page {page.page} / {page.pageCount}
        </span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onPage(page.page + 1)}
          disabled={page.page >= page.pageCount}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <Icon name="chevron-right" size={15} />
        </button>
      </div>
    </nav>
  );
}
