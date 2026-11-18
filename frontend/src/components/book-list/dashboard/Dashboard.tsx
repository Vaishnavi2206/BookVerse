import { useState } from "react";
import { useLocation } from "react-router-dom";
import BookList from "../BookList";
import LibraryDetails from "../../library/library-details/LibraryDetails";
import AnalyticsBoard from "../../analytics/AnalyticsBoard";
import DashboardSidebar from "./DashboardSidebar";
import { isDashboardPage, type DashboardPage } from "./DashboardPages";
import "./Dashboard.css";

export default function DashBoard() {
  const location = useLocation();
  const locationState: unknown = location.state;
  const requestedPage =
    typeof locationState === "object" && locationState !== null
      ? "dashboardPage" in locationState
        ? locationState.dashboardPage
        : null
      : null;
  const [page, setPage] = useState<DashboardPage>(() =>
    isDashboardPage(requestedPage) ? requestedPage : "Books",
  );
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  return (
    <div className="dashboard">
      <DashboardSidebar activePage={page} onPageChange={setPage} />

      <main className="dashboard-main" ref={setScrollElement}>
        {page === "Books" && (
          <BookList category="All" scrollElement={scrollElement} />
        )}
        {page === "Favourites" && (
          <BookList category="Favourites" scrollElement={scrollElement} />
        )}
        {page === "Library" && <LibraryDetails />}
        {page === "Analytics" && <AnalyticsBoard />}
      </main>
    </div>
  );
}
