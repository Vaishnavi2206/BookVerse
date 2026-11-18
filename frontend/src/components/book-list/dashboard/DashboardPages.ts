import {
  faBookOpen,
  faChartLine,
  faHeart,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";

export const dashboardPages = [
  { label: "Books", icon: faBookOpen },
  { label: "Favourites", icon: faHeart },
  { label: "Library", icon: faLayerGroup },
  { label: "Analytics", icon: faChartLine },
] as const;

export type DashboardPage = (typeof dashboardPages)[number]["label"];

export function isDashboardPage(value: unknown): value is DashboardPage {
  return dashboardPages.some(({ label }) => label === value);
}
