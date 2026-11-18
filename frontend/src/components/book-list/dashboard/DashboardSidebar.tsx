import { useState } from "react";
import { signOut } from "firebase/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookOpen,
  faChevronLeft,
  faChevronRight,
  faRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";
import { auth } from "../../../shared/firebase";
import { useAuth } from "../../../context/AuthContext";
import { dashboardPages, type DashboardPage } from "./DashboardPages";

function DashboardSidebar({
  activePage,
  onPageChange,
  side = "left",
}: {
  activePage: DashboardPage;
  onPageChange: (page: DashboardPage) => void;
  side?: "left" | "right";
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { uiUser } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign out.");
    }
  };

  return (
    <aside
      className={`dashboard-sidebar${collapsed ? " is-collapsed" : ""}${side === "right" ? " is-right" : ""}`}
      aria-label="Book Verse navigation"
    >
      <div className="dashboard-brand">
        <span className="dashboard-brand-mark" aria-hidden="true">
          <FontAwesomeIcon icon={faBookOpen} />
        </span>
        <span className="dashboard-brand-name">Book Verse</span>
        <button
          className="dashboard-signout"
          type="button"
          onClick={handleSignOut}
          aria-label="Log out"
          title={collapsed ? "Log out" : undefined}
        >
          <FontAwesomeIcon icon={faRightFromBracket} aria-hidden="true" />
          <span className="dashboard-signout-label">Log out</span>
        </button>
      </div>

      <span className="dashboard-nav-label">YOUR SPACE</span>
      <nav className="dashboard-nav" aria-label="Main navigation">
        {dashboardPages.map(({ label, icon }) => (
          <button
            className={`dashboard-nav-link${activePage === label ? " is-active" : ""}`}
            key={label}
            type="button"
            onClick={() => onPageChange(label)}
            aria-current={activePage === label ? "page" : undefined}
            title={collapsed ? label : undefined}
          >
            <span className="dashboard-nav-icon" aria-hidden="true">
              <FontAwesomeIcon icon={icon} />
            </span>
            <span className="dashboard-nav-text">{label}</span>
            {activePage === label && (
              <span className="dashboard-nav-indicator" aria-hidden="true" />
            )}
          </button>
        ))}
      </nav>

      <button
        className="dashboard-collapse-toggle"
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <FontAwesomeIcon
          icon={
            collapsed
              ? side === "right"
                ? faChevronLeft
                : faChevronRight
              : side === "right"
                ? faChevronRight
                : faChevronLeft
          }
          aria-hidden="true"
        />
        <span>{collapsed ? "Expand" : "Collapse"}</span>
      </button>

      <div className="dashboard-sidebar-note">
        <span aria-hidden="true">✦</span>
        <p>A little reading goes a long way.</p>
      </div>

      {uiUser && (
        <div
          className="dashboard-user"
          role="group"
          aria-label="Signed-in user"
          title={collapsed ? uiUser.displayName || uiUser.email || "Reader" : undefined}
        >
          {uiUser.photoUrl ? (
            <img className="dashboard-user-photo" src={uiUser.photoUrl} alt="" />
          ) : (
            <span className="dashboard-user-initial" aria-hidden="true">
              {(uiUser.displayName || uiUser.email || "R").charAt(0).toUpperCase()}
            </span>
          )}
          <span className="dashboard-user-details">
            <span className="dashboard-user-name">
              {uiUser.displayName || "Reader"}
            </span>
            {uiUser.email && (
              <span className="dashboard-user-email">{uiUser.email}</span>
            )}
          </span>
        </div>
      )}
    </aside>
  );
}

export default DashboardSidebar;
