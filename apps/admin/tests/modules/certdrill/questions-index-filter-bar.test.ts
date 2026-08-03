import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../src/modules/certdrill/questions-index-filter-bar.tsx", import.meta.url),
  "utf8",
);

describe("questions index filter bar source", () => {
  it("keeps the race-protected 250ms debounced search pattern", () => {
    expect(source).toContain('"use client"');
    expect(source).toContain("useRouter");
    expect(source).toContain("usePathname");
    expect(source).toContain("useSearchParams");
    expect(source).toContain("setTimeout");
    expect(source).toContain("250");
    expect(source).toContain("searchDebounceRef");
    expect(source).toContain("searchNavigationVersionRef");
    expect(source).toContain("pendingSearchNavigationsRef");
    expect(source).toContain("matchingNavigationIndex");
    expect(source).toContain("clearTimeout(searchDebounceRef.current)");
  });

  it("tracks the current query separately and removes page for immediate and debounced filter changes", () => {
    expect(source).toContain("const currentQueryParamsRef = useRef(new URLSearchParams(searchParams.toString()));");
    expect(source).toContain("const params = new URLSearchParams(currentQueryParamsRef.current);");
    expect(source).toContain("currentQueryParamsRef.current = params;");
    expect(source).toContain('params.delete("page");');
    expect(source).toContain("buildQuestionsIndexFilterQuery");
    expect(source).toContain("buildQuestionsIndexClearQuery");
    expect(source).toContain("router.replace(");
    expect(source).toContain("scroll: false");
  });

  it("derives the displayed search from a draft keyed to the server search without syncing state in an effect", () => {
    expect(source).toContain('const serverSearch = query.search ?? "";');
    expect(source).toContain("const [searchDraft, setSearchDraft] = useState({ value: serverSearch, base: serverSearch });");
    expect(source).toContain("const search = searchDraft.base === serverSearch ? searchDraft.value : serverSearch;");
    expect(source).toContain("setSearchDraft({ base: serverSearch, value: event.target.value });");
    expect(source).toContain('setSearchDraft({ base: serverSearch, value: "" });');
    expect(source).not.toContain('const [search, setSearch] = useState(query.search ?? "");');
    expect(source).not.toContain("setSearch(serverSearch);");
  });

  it("uses compatibility helpers for certification-aware category behavior", () => {
    expect(source).toContain("getQuestionsIndexCategoryOptions");
    expect(source).toContain("buildQuestionsIndexHref");
    expect(source).toContain("certificationId");
    expect(source).toContain("categoryId");
    expect(source).toContain("Search across all certifications");
    expect(source).toContain("All certifications");
    expect(source).toContain("All categories");
    expect(source).toContain("Clear filters");
  });

  it("avoids legacy tab or question-prefixed parameter coupling", () => {
    expect(source).not.toContain('"tab"');
    expect(source).not.toContain("questionSearch");
    expect(source).not.toContain("questionStatus");
    expect(source).not.toContain("questionDifficulty");
    expect(source).not.toContain("questionCategoryId");
    expect(source).not.toContain("questionSort");
    expect(source).not.toContain("questionPage");
  });
});
